// Property 13: Sandbox isolation. Validates: Requirements 3.14, 5.1, 5.13, 10.10
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import fc from "fast-check";
import { describe, it } from "vitest";
import { type SandboxHandle, withSandbox } from "../../src/adapters/sandbox.js";

type RunKind = "pass" | "throw" | "timeout";

const WORK_DIR = ".trickortest";

const hashTree = async (root: string): Promise<string> => {
  const entries: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const name of (await readdir(dir)).sort()) {
      const full = join(dir, name);
      const rel = relative(root, full);
      if (rel === WORK_DIR) continue;
      const info = await stat(full);
      if (info.isDirectory()) {
        entries.push(`d:${rel}`);
        await walk(full);
      } else {
        const digest = createHash("sha256")
          .update(await readFile(full))
          .digest("hex");
        entries.push(`f:${rel}:${digest}`);
      }
    }
  };
  await walk(root);
  return createHash("sha256").update(entries.join("\n")).digest("hex");
};

const segmentArb = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/);
const fileArb = fc.record({
  path: fc.array(segmentArb, { minLength: 1, maxLength: 3 }).map((s) => `${s.join("/")}.txt`),
  content: fc.string({ maxLength: 40 }),
});
const filesArb = fc.uniqueArray(fileArb, {
  maxLength: 6,
  selector: (f) => f.path,
});
const runsArb = fc.array(fc.constantFrom<RunKind>("pass", "throw", "timeout"), {
  minLength: 1,
  maxLength: 5,
});

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

const runOnce = async (projectRoot: string, kind: RunKind, index: number): Promise<void> => {
  const body = async (handle: SandboxHandle): Promise<string> => {
    // Mutate the sandbox copy: overwrite, add and remove files.
    await mkdir(join(handle.root, "added"), { recursive: true });
    await writeFile(join(handle.root, "added", "mutant.txt"), `mutant ${index}`);
    for (const name of await readdir(handle.root)) {
      if (name.endsWith(".txt")) await writeFile(join(handle.root, name), "mutated");
    }
    if (kind === "throw") throw new Error("crash in run");
    if (kind === "timeout") {
      await new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), 5);
      });
    }
    return "done";
  };
  try {
    await withSandbox(projectRoot, `mutant-${index}`, body);
  } catch {
    // Failing and timed-out runs are expected to propagate.
  }
};

describe("Property 13: Sandbox isolation", () => {
  it("leaves the working tree untouched and no sandbox behind after any run sequence", async () => {
    await fc.assert(
      fc.asyncProperty(filesArb, runsArb, async (files, runs) => {
        const projectRoot = await mkdtemp(join(tmpdir(), "tot-sandbox-prop-"));
        try {
          for (const file of files) {
            const full = join(projectRoot, file.path);
            await mkdir(dirname(full), { recursive: true });
            await writeFile(full, file.content);
          }
          // A root-level file guarantees the mutation loop has something to overwrite.
          await writeFile(join(projectRoot, "root.txt"), "root");
          const before = await hashTree(projectRoot);

          for (const [index, kind] of runs.entries()) {
            await runOnce(projectRoot, kind, index);
          }

          const after = await hashTree(projectRoot);
          const sandboxes = join(projectRoot, WORK_DIR, "sandboxes");
          const left = (await exists(sandboxes)) ? await readdir(sandboxes) : [];
          return after === before && left.length === 0;
        } finally {
          await rm(projectRoot, { recursive: true, force: true });
        }
      }),
    );
  }, 60_000);
});
