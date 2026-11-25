import { describe, expect, it } from "vitest";
import { type CliDeps, runCli } from "../../src/cli/main.js";
import { err, ok } from "../../src/core/result.js";
import type { RunMetadata } from "../../src/core/types.js";

const CWD = "/work";
const ROOT = "/work/proj";
const REQUIREMENTS = `# Requirements
### Requirement 1: Pricing
#### Acceptance Criteria
1. THE Cart SHALL compare below ten.
`;
const mutant = (id: string): string =>
  JSON.stringify({
    id,
    requirement: "1.1",
    file: "src/f.ts",
    original: "a < 10",
    mutated: "a <= 10",
    why: "boundary",
    witness: { from: "src/f.ts", export: "f", args: [10], expected: false },
  });
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

const harness = (files: Record<string, string>) => {
  const store = new Map(Object.entries(files));
  const out: string[] = [];
  const errOut: string[] = [];
  const reads: string[] = [];
  const calls = { suite: 0, stryker: 0 };
  const isDir = (path: string): boolean => [...store.keys()].some((f) => f.startsWith(`${path}/`));
  const deps: CliDeps = {
    cwd: CWD,
    stdout: (text) => out.push(text),
    stderr: (text) => errOut.push(text),
    fs: {
      async readFile(path) {
        reads.push(path);
        const original = path.replace(/\/\.trickortest\/sandboxes\/[^/]+/, "");
        const text = store.get(path) ?? store.get(original);
        return text === undefined ? err(`ENOENT ${path}`) : ok(text);
      },
      async exists(path) {
        return store.has(path) || isDir(path);
      },
      async listDir(path) {
        if (!isDir(path)) return err("ENOENT");
        const names = new Set<string>();
        for (const f of store.keys()) {
          if (f.startsWith(`${path}/`)) names.add(f.slice(path.length + 1).split("/")[0] as string);
        }
        return ok([...names]);
      },
      async writeFile(path, content) {
        store.set(path, content);
        return ok(undefined);
      },
    },
    suite: {
      async run() {
        calls.suite += 1;
        return ok({
          durationMs: 10,
          files: [
            { path: "test/a.test.ts", tests: [{ name: "a", status: "passed", startLine: 1 }] },
          ],
        });
      },
    },
    mechanical: {
      async run() {
        calls.stryker += 1;
        return ok({ mutants: [], testFiles: {}, ignoreStaticRetried: false });
      },
    },
    git: {
      async diff() {
        return ok("");
      },
    },
    sandbox: () => ({
      async create(_root, id) {
        return ok({ root: `${ROOT}/.trickortest/sandboxes/${id}` });
      },
      async destroy() {
        return ok(undefined);
      },
    }),
    typecheck: {
      async run() {
        return ok(undefined);
      },
    },
    witness: {
      async run(root, witnesses) {
        const pristine = root.endsWith("/pristine");
        return ok(
          Object.fromEntries(
            witnesses.map((w) => [w.id, ok({ kind: "value" as const, value: !pristine })]),
          ),
        );
      },
    },
    metadata: async () => metadata,
  };
  return { deps, calls, reads, out: () => out.join(""), errOut: () => errOut.join("") };
};

const oneSpec = {
  [`${ROOT}/.kiro/specs/alpha/requirements.md`]: REQUIREMENTS,
  [`${ROOT}/mutants/alpha/oath-1.1-alpha.json`]: mutant("oath-1.1-alpha"),
  [`${ROOT}/src/f.ts`]: "export const f = (a: number) => a < 10;\n",
};
const twoSpecs = {
  ...oneSpec,
  [`${ROOT}/.kiro/specs/beta/requirements.md`]: REQUIREMENTS,
  [`${ROOT}/mutants/beta/oath-1.1-beta.json`]: mutant("oath-1.1-beta"),
};

describe("CLI spec selection", () => {
  it("9.16 two specs without --spec exit 1, list both names and run neither baseline nor StrykerJS", async () => {
    const h = harness(twoSpecs);
    const code = await runCli(["run", "--project", ROOT], h.deps);
    expect(code).toBe(1);
    expect(h.errOut()).toContain("alpha, beta");
    expect(h.errOut()).toContain("--spec <name>");
    expect(h.calls).toEqual({ suite: 0, stryker: 0 });
  });

  it("9.5 two specs with --spec attack only that spec and never load the other's mutants", async () => {
    const h = harness(twoSpecs);
    const code = await runCli(["run", "--project", ROOT, "--spec", "beta"], h.deps);
    expect(code).toBe(0);
    expect(h.errOut()).toBe("");
    expect(h.reads.some((p) => p.includes("/mutants/alpha/"))).toBe(false);
    expect(h.reads.some((p) => p.includes("/specs/alpha/"))).toBe(false);
    expect(h.reads).toContain(`${ROOT}/mutants/beta/oath-1.1-beta.json`);
    expect(h.out()).toContain("Surviving spec mutants: 1");
  });

  it("9.16 one spec without --spec still runs", async () => {
    const h = harness(oneSpec);
    expect(await runCli(["run", "--project", ROOT], h.deps)).toBe(0);
    expect(h.calls.suite).toBeGreaterThan(0);
    expect(h.calls.stryker).toBe(1);
  });

  it("9.5 an unknown --spec exits 1 and lists the available names", async () => {
    const h = harness(twoSpecs);
    const code = await runCli(["run", "--project", ROOT, "--spec", "gamma"], h.deps);
    expect(code).toBe(1);
    expect(h.errOut()).toContain("gamma");
    expect(h.errOut()).toContain("alpha, beta");
    expect(h.calls).toEqual({ suite: 0, stryker: 0 });
  });

  it("9.5 no spec directory with a requirements.md exits 1 with the no spec found error", async () => {
    const h = harness({ [`${ROOT}/.kiro/specs/draft/design.md`]: "# Draft" });
    const code = await runCli(["run", "--project", ROOT], h.deps);
    expect(code).toBe(1);
    expect(h.errOut()).toContain("no spec found");
    expect(h.calls).toEqual({ suite: 0, stryker: 0 });
  });
});
