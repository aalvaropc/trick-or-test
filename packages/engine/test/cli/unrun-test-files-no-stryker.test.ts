import { describe, expect, it } from "vitest";
import type { SuiteResult } from "../../src/adapters/vitest-suite-runner.js";
import { type CliDeps, runCli } from "../../src/cli/main.js";
import { err, ok } from "../../src/core/result.js";
import type { RunMetadata } from "../../src/core/types.js";

const CWD = "/work";
const ROOT = "/work/proj";
const PHRASE = "test files outside the StrykerJS run";
const REQUIREMENTS = `# Requirements
### Requirement 1: Pricing
#### Acceptance Criteria
1. THE Cart SHALL compare below ten.
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
const TEST_FILE = [
  "// Validates: Requirements 1.1",
  'it("a", () => {',
  "  expect(1).toBe(1);",
  "});",
  "",
].join("\n");
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
const baselineFiles = ["test/a.test.ts", "extra/guard.test.ts"];
const passing: SuiteResult = {
  durationMs: 10,
  files: baselineFiles.map((path) => ({
    path,
    tests: [{ name: "a", status: "passed" as const, startLine: 2 }],
  })),
};
const failing: SuiteResult = {
  durationMs: 10,
  files: [{ path: "test/a.test.ts", tests: [{ name: "a", status: "failed", startLine: 2 }] }],
};
const CHANGED_DIFF = [
  "diff --git a/src/f.ts b/src/f.ts",
  "--- a/src/f.ts",
  "+++ b/src/f.ts",
  "@@ -1 +1 @@",
  "-export const f = (a: number) => a <= 10;",
  "+export const f = (a: number) => a < 10;",
  "",
].join("\n");

const harness = (diff: string) => {
  const files = new Map<string, string>([
    [`${ROOT}/.kiro/specs/demo/requirements.md`, REQUIREMENTS],
    [`${ROOT}/mutants/demo/oath-1.1-boundary.json`, MUTANT],
    [`${ROOT}/src/f.ts`, "export const f = (a: number) => a < 10;\n"],
    [`${ROOT}/test/a.test.ts`, TEST_FILE],
    [`${ROOT}/extra/guard.test.ts`, TEST_FILE],
  ]);
  const out: string[] = [];
  const written: string[] = [];
  let suiteRuns = 0;
  let strykerRuns = 0;
  const isDir = (path: string): boolean => [...files.keys()].some((f) => f.startsWith(`${path}/`));
  const deps: CliDeps = {
    cwd: CWD,
    stdout: (text) => out.push(text),
    stderr: () => {},
    fs: {
      async readFile(path) {
        const original = path.replace(/\/\.trickortest\/sandboxes\/[^/]+/, "");
        const text = files.get(path) ?? files.get(original);
        return text === undefined ? err(`ENOENT ${path}`) : ok(text);
      },
      async exists(path) {
        return files.has(path) || isDir(path);
      },
      async listDir(path) {
        if (!isDir(path)) return err("ENOENT");
        const names = new Set<string>();
        for (const f of files.keys()) {
          if (f.startsWith(`${path}/`)) names.add(f.slice(path.length + 1).split("/")[0] as string);
        }
        return ok([...names]);
      },
      async writeFile(path, content) {
        files.set(path, content);
        written.push(path);
        return ok(undefined);
      },
      async listEntries() {
        return [];
      },
    },
    suite: {
      async run() {
        suiteRuns += 1;
        return ok(suiteRuns === 1 ? passing : failing);
      },
    },
    mechanical: {
      async run() {
        strykerRuns += 1;
        return ok({
          mutants: [],
          testFiles: { "test/a.test.ts": [] },
          ignoreStaticRetried: false,
        });
      },
    },
    git: {
      async diff() {
        return ok(diff);
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
  return { deps, out: () => out.join(""), written, strykerRuns: () => strykerRuns };
};

const ARGS = ["run", "--project", ROOT, "--scope", "full", "--since", "HEAD"];

describe("unrun test files, StrykerJS did not start", () => {
  it("9.25 no changed source line: the summary has no outside-the-run line", async () => {
    const h = harness("");
    expect(await runCli(ARGS, h.deps)).toBe(0);
    expect(h.strykerRuns()).toBe(0);
    expect(h.out()).not.toContain(PHRASE);
  });

  it("9.25 no changed source line: the other summary lines are still printed", async () => {
    const h = harness("");
    await runCli(ARGS, h.deps);
    expect(h.out()).toContain("Scope: full\n");
    expect(h.out()).toContain("Surviving spec mutants: 0\n");
    expect(h.out()).toContain("Strays: 0\n");
    expect(h.out()).toContain("killing tests outside the baseline: 0\n");
    expect(h.out()).toContain("Written:\n");
  });

  it("3.10 no changed source line: the three files are written", async () => {
    const h = harness("");
    await runCli(ARGS, h.deps);
    expect(h.written.filter((p) => /mutation-report\.json$/.test(p))).toHaveLength(1);
    expect(h.written.filter((p) => /verdict\.json$/.test(p))).toHaveLength(1);
    expect(h.written.filter((p) => /history\.jsonl$/.test(p))).toHaveLength(1);
  });

  it("9.25 a changed source line starts StrykerJS and prints exactly one line with the count", async () => {
    const h = harness(CHANGED_DIFF);
    expect(await runCli(ARGS, h.deps)).toBe(0);
    expect(h.strykerRuns()).toBe(1);
    const lines = h
      .out()
      .split("\n")
      .filter((l) => l.includes(PHRASE));
    expect(lines).toEqual([`${PHRASE}: 1`]);
  });
});
