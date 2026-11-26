import { describe, expect, it } from "vitest";
import type { SuiteResult } from "../../src/adapters/vitest-suite-runner.js";
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

const harness = (strykerFiles: string[]) => {
  const files = new Map<string, string>([
    [`${ROOT}/.kiro/specs/demo/requirements.md`, REQUIREMENTS],
    [`${ROOT}/mutants/demo/oath-1.1-boundary.json`, MUTANT],
    [`${ROOT}/src/f.ts`, "export const f = (a: number) => a < 10;\n"],
    [`${ROOT}/test/a.test.ts`, TEST_FILE],
    [`${ROOT}/extra/guard.test.ts`, TEST_FILE],
  ]);
  const out: string[] = [];
  let suiteRuns = 0;
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
        return ok({
          mutants: [],
          testFiles: Object.fromEntries(strykerFiles.map((f) => [f, []])),
          ignoreStaticRetried: false,
        });
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
  return { deps, out: () => out.join("") };
};

describe("unrun test files summary", () => {
  it("3.24 a Baseline_Test file that StrykerJS did not run is counted and listed", async () => {
    const h = harness(["test/a.test.ts"]);
    expect(await runCli(["run", "--project", ROOT, "--scope", "full"], h.deps)).toBe(0);
    expect(h.out()).toContain("test files outside the StrykerJS run: 1\nextra/guard.test.ts\n");
  });

  it("9.23 the line says 0 and lists no path when StrykerJS ran every file", async () => {
    const h = harness(["test/a.test.ts", "extra/guard.test.ts"]);
    await runCli(["run", "--project", ROOT, "--scope", "full"], h.deps);
    expect(h.out()).toContain("test files outside the StrykerJS run: 0\n");
    expect(h.out()).not.toContain("extra/guard.test.ts");
  });

  it("9.23 a spec-only run prints no such line", async () => {
    const h = harness([]);
    await runCli(["run", "--project", ROOT, "--scope", "spec-only"], h.deps);
    expect(h.out()).not.toContain("did not run");
  });
});
