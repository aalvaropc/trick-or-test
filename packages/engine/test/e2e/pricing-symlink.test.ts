import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verdictSchema } from "../../src/core/report.js";
import type { Verdict } from "../../src/core/types.js";

// Requirement 9.26: the built CLI gives the same ids for a project reached through a symbolic
// link as for its real path. Runs only through `npm run test:e2e --workspace trick-or-test`.
// Reads and writes nothing in examples/pricing/src/ or examples/pricing/test/.

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const project = join(repoRoot, "examples", "pricing");
const cliPath = join(repoRoot, "packages", "engine", "dist", "cli", "main.js");
const scratchBase = join(repoRoot, ".trickortest");

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const exec = (command: string, args: string[], cwd: string): Promise<Run> =>
  new Promise((done) => {
    execFile(
      command,
      args,
      { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : Number.NaN;
        done({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });

const cliArgs = (projectArg: string, output: string): string[] => [
  cliPath,
  "measure",
  "--scope",
  "spec-only",
  "--spec",
  "cart-pricing",
  "--project",
  projectArg,
  "--output",
  output,
];

describe("pricing project through a symbolic link", () => {
  let scratch = "";
  let linkRefused: string | undefined;
  let direct: Run;
  let viaLink: Run;
  let directVerdict: Verdict | undefined;
  let linkVerdict: Verdict | undefined;

  const readVerdict = async (dir: string): Promise<Verdict | undefined> => {
    try {
      const raw: unknown = JSON.parse(await readFile(join(dir, "verdict.json"), "utf8"));
      const parsed = verdictSchema.safeParse(raw);
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  };

  beforeAll(async () => {
    const build = await exec("npm", ["run", "build", "--workspace", "trick-or-test"], repoRoot);
    expect(build.code, build.stdout + build.stderr).toBe(0);

    await mkdir(scratchBase, { recursive: true });
    scratch = await mkdtemp(join(scratchBase, "e2e-symlink-"));
    const link = join(scratch, "pricing-link");
    try {
      await symlink(project, link, "dir");
    } catch (error) {
      linkRefused = error instanceof Error ? error.message : String(error);
      return;
    }
    const realProject = await realpath(project);
    const directOut = join(scratch, "out-real");
    const linkOut = join(scratch, "out-link");
    direct = await exec(process.execPath, cliArgs(realProject, directOut), repoRoot);
    viaLink = await exec(process.execPath, cliArgs(link, linkOut), repoRoot);
    directVerdict = await readVerdict(directOut);
    linkVerdict = await readVerdict(linkOut);
  }, 900_000);

  afterAll(async () => {
    if (scratch !== "") await rm(scratch, { recursive: true, force: true });
  });

  // Skipped with a stated reason, never silently passed, when the platform refuses the link.
  it("9.26 the link run and the real-path run give the same test ids and claim counts", (ctx) => {
    if (linkRefused !== undefined) {
      ctx.skip(`the platform refused to create a symbolic link: ${linkRefused}`);
      return;
    }
    expect(direct.code, direct.stderr).toBe(0);
    expect(viaLink.code, viaLink.stderr).toBe(0);
    expect(directVerdict, "verdict.json of the real-path run").toBeDefined();
    expect(linkVerdict, "verdict.json of the link run").toBeDefined();
    const a = directVerdict as Verdict;
    const b = linkVerdict as Verdict;

    const baselineIds = (v: Verdict): string[] => (v.baselineTests ?? []).map((t) => t.id).sort();
    const killing = (v: Verdict): string[] =>
      v.mutants.flatMap((m) => m.killingTests.map((t) => `${m.id} ${t}`)).sort();

    expect(baselineIds(a).length).toBeGreaterThan(0);
    expect(baselineIds(b)).toEqual(baselineIds(a));
    expect(killing(a).length).toBeGreaterThan(0);
    expect(killing(b)).toEqual(killing(a));
    expect(b.claimCounts).toEqual(a.claimCounts);

    for (const v of [a, b]) {
      const ids = [...baselineIds(v), ...v.mutants.flatMap((m) => m.killingTests)];
      for (const id of ids) expect(id.split(/[/\\:]+/), id).not.toContain("..");
      for (const test of v.mutants.flatMap((m) => m.killingTests)) {
        expect(test.includes(".trickortest/"), test).toBe(false);
      }
    }
  });
});
