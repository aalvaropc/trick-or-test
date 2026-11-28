import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SuiteResult } from "../../src/adapters/vitest-suite-runner.js";
import { type CliDeps, runCli } from "../../src/cli/main.js";
import { verdictSchema } from "../../src/core/report.js";
import { err, ok } from "../../src/core/result.js";
import type { RunMetadata, Verdict } from "../../src/core/types.js";

// Requirements 9.26 and 9.27: the project root is resolved with realpath once, before any stage.

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const scratchBase = join(repoRoot, ".trickortest");

const REQUIREMENTS = `# Requirements
### Requirement 1: Pricing
#### Acceptance Criteria
1. THE Cart SHALL compare below ten.
2. THE Cart SHALL say something else.
`;
const MUTANT = JSON.stringify({
  id: "oath-1.1-boundary",
  requirement: "1.1",
  file: "src/f.ts",
  original: "a < 10",
  mutated: "a <= 10",
  why: "boundary",
  witness: { from: "src/f.ts", export: "f", args: [10], expected: false },
});
const SOURCE = "export const f = (a: number) => a < 10;\n";
const TEST_FILE = 'it("a", () => {\n  expect(1).toBe(1);\n});\n';
const metadata: RunMetadata = {
  gitCommit: "abc",
  seed: 0,
  engineVersion: "0.0.0",
  nodeVersion: "v24",
  strykerVersion: "10.1.1",
  vitestVersion: "5.1.0",
  typescriptVersion: "7.0.2",
  timestamp: "2026-01-01T00:00:00.000Z",
};
const passing: SuiteResult = {
  durationMs: 10,
  files: [{ path: "test/a.test.ts", tests: [{ name: "a", status: "passed", startLine: 1 }] }],
};
const killing: SuiteResult = {
  durationMs: 10,
  files: [{ path: "test/a.test.ts", tests: [{ name: "a", status: "failed", startLine: 1 }] }],
};

/** Fake adapters over an in-memory file map keyed by the REAL path of the project. */
const harness = (realRoot: string, cwd: string) => {
  const files = new Map<string, string>([
    [`${realRoot}/.kiro/specs/demo/requirements.md`, REQUIREMENTS],
    [`${realRoot}/mutants/demo/oath-1.1-boundary.json`, MUTANT],
    [`${realRoot}/src/f.ts`, SOURCE],
    [`${realRoot}/test/a.test.ts`, TEST_FILE],
  ]);
  const out: string[] = [];
  const errOut: string[] = [];
  let calls = 0;
  let suiteCalls = 0;
  const isDir = (path: string): boolean => [...files.keys()].some((f) => f.startsWith(`${path}/`));
  const deps: CliDeps = {
    cwd,
    stdout: (text) => out.push(text),
    stderr: (text) => errOut.push(text),
    fs: {
      async readFile(path) {
        calls += 1;
        const original = path.replace(/\/\.trickortest\/sandboxes\/[^/]+/, "");
        const text = files.get(path) ?? files.get(original);
        return text === undefined ? err(`ENOENT ${path}`) : ok(text);
      },
      async exists(path) {
        calls += 1;
        return files.has(path) || isDir(path);
      },
      async listDir(path) {
        calls += 1;
        if (!isDir(path)) return err("ENOENT");
        const names = new Set<string>();
        for (const f of files.keys()) {
          if (f.startsWith(`${path}/`)) names.add(f.slice(path.length + 1).split("/")[0] as string);
        }
        return ok([...names]);
      },
      async writeFile(path, content) {
        calls += 1;
        files.set(path, content);
        return ok(undefined);
      },
    },
    suite: {
      async run() {
        calls += 1;
        suiteCalls += 1;
        return ok(suiteCalls === 1 ? passing : killing);
      },
    },
    mechanical: {
      async run() {
        calls += 1;
        return ok({ mutants: [], testFiles: {}, ignoreStaticRetried: false });
      },
    },
    git: {
      async diff() {
        calls += 1;
        return ok("");
      },
    },
    sandbox: () => ({
      async create(_root, id) {
        calls += 1;
        return ok({ root: `${realRoot}/.trickortest/sandboxes/${id}` });
      },
      async destroy() {
        calls += 1;
        return ok(undefined);
      },
    }),
    typecheck: {
      async run() {
        calls += 1;
        return ok(undefined);
      },
    },
    witness: {
      async run(root, witnesses) {
        calls += 1;
        const pristine = root.endsWith("/pristine");
        return ok(
          Object.fromEntries(
            witnesses.map((w) => [w.id, ok({ kind: "value" as const, value: !pristine })]),
          ),
        );
      },
    },
    metadata: async () => {
      calls += 1;
      return metadata;
    },
    // The real file system, as in production: the project folders exist on disk.
    realpath: (path) => realpath(path),
  };
  return {
    deps,
    files,
    calls: () => calls,
    out: () => out.join(""),
    errOut: () => errOut.join(""),
  };
};

describe("project root through a symbolic link", () => {
  let scratch = "";
  let realProject = "";
  let link = "";
  let linkRefused: string | undefined;

  beforeAll(async () => {
    await mkdir(scratchBase, { recursive: true });
    scratch = await realpath(await mkdtemp(join(scratchBase, "realpath-")));
    realProject = join(scratch, "proj");
    link = join(scratch, "link");
    await mkdir(realProject, { recursive: true });
    try {
      await symlink(realProject, link, "dir");
    } catch (error) {
      linkRefused = error instanceof Error ? error.message : String(error);
    }
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  const verdictOf = (files: Map<string, string>, root: string): Verdict => {
    const text = files.get(`${root}/reports/verdict.json`);
    expect(text, `no verdict.json under ${root}/reports`).toBeDefined();
    const parsed = verdictSchema.safeParse(JSON.parse(text as string));
    expect(parsed.success).toBe(true);
    return (parsed as { data: Verdict }).data;
  };

  // Skipped, never silently passed, when the platform refuses to create a symbolic link.
  // The reason is in the test body below and is checked by the guard test.
  it("9.26 a link to the project gives the same baseline tests, killing tests and claim counts as the real path", async (ctx) => {
    if (linkRefused !== undefined) {
      ctx.skip(`the platform refused to create a symbolic link: ${linkRefused}`);
      return;
    }
    const direct = harness(realProject, scratch);
    const viaLink = harness(realProject, scratch);
    expect(await runCli(["run", "--project", realProject], direct.deps)).toBe(0);
    const linkCode = await runCli(["run", "--project", link], viaLink.deps);
    expect(linkCode, viaLink.errOut()).toBe(0);

    const a = verdictOf(direct.files, realProject);
    const b = verdictOf(viaLink.files, realProject);
    const baselineIds = (v: Verdict): string[] => (v.baselineTests ?? []).map((t) => t.id).sort();
    const killingIds = (v: Verdict): string[] => v.mutants.flatMap((m) => m.killingTests).sort();

    expect(baselineIds(a)).toEqual(["test/a.test.ts::a"]);
    expect(baselineIds(b)).toEqual(baselineIds(a));
    expect(killingIds(a)).toEqual(["test/a.test.ts::a"]);
    expect(killingIds(b)).toEqual(killingIds(a));
    expect(b.claimCounts).toEqual(a.claimCounts);
    for (const id of [...baselineIds(b), ...killingIds(b)]) {
      expect(id.split(/[/\\:]+/)).not.toContain("..");
      expect(id.includes(".trickortest/")).toBe(false);
    }
  });

  it("9.27 a root whose real path cannot be read prints the path as given, exits 1 and runs no stage", async () => {
    const missing = join(scratch, "does-not-exist");
    const h = harness(realProject, scratch);
    const filesBefore = [...h.files.keys()].sort();
    const code = await runCli(["run", "--project", missing], h.deps);
    expect(code).toBe(1);
    expect(h.errOut()).toContain(missing);
    expect(h.out()).toBe("");
    expect(h.calls()).toBe(0);
    expect([...h.files.keys()].sort()).toEqual(filesBefore);
  });
});
