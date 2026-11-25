import { describe, expect, it } from "vitest";
import type { SuiteError, SuiteResult } from "../../src/adapters/vitest-suite-runner.js";
import { USAGE_TEXT } from "../../src/cli/args.js";
import { type CliDeps, runCli } from "../../src/cli/main.js";
import { err, ok, type Result } from "../../src/core/result.js";
import type { RunMetadata } from "../../src/core/types.js";

const CWD = "/work";
const ROOT = "/work/proj";
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

type Setup = {
  files?: Record<string, string>;
  baseline?: Result<SuiteResult, SuiteError>;
  mutantSuite?: SuiteResult;
  strykerError?: string;
  throwInMechanical?: boolean;
};

const harness = (setup: Setup = {}) => {
  const files = new Map<string, string>(
    Object.entries(
      setup.files ?? {
        [`${ROOT}/.kiro/specs/demo/requirements.md`]: REQUIREMENTS,
        [`${ROOT}/mutants/demo/oath-1.1-boundary.json`]: MUTANT,
        [`${ROOT}/src/f.ts`]: SOURCE,
      },
    ),
  );
  const out: string[] = [];
  const errOut: string[] = [];
  let suiteCalls = 0;
  const isDir = (path: string): boolean => [...files.keys()].some((f) => f.startsWith(`${path}/`));
  const deps: CliDeps = {
    cwd: CWD,
    stdout: (text) => out.push(text),
    stderr: (text) => errOut.push(text),
    fs: {
      async readFile(path) {
        // A sandbox is a copy of the project: fall back to the original file.
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
    },
    suite: {
      async run() {
        suiteCalls += 1;
        if (suiteCalls === 1) return setup.baseline ?? ok(passing);
        return ok(setup.mutantSuite ?? passing);
      },
    },
    mechanical: {
      async run() {
        if (setup.throwInMechanical) throw new Error("boom");
        if (setup.strykerError !== undefined) return err(setup.strykerError);
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
  return { deps, files, out: () => out.join(""), errOut: () => errOut.join("") };
};

const killingSuite: SuiteResult = {
  durationMs: 10,
  files: [{ path: "test/a.test.ts", tests: [{ name: "a", status: "failed", startLine: 1 }] }],
};

describe("runCli", () => {
  it("9.6 the summary lists survivors, criteria per status, strays and written paths", async () => {
    const h = harness();
    const code = await runCli(["run", "--project", ROOT], h.deps);
    expect(code).toBe(0);
    const text = h.out();
    expect(text).toContain("Surviving spec mutants: 1");
    expect(text).toContain("guarded: 0");
    expect(text).toContain("unguarded: 1");
    expect(text).toContain("unattacked: 1");
    expect(text).toContain("skipped: 0");
    expect(text).toContain("Strays: 0");
    for (const name of ["mutation-report.json", "verdict.json", "history.jsonl"]) {
      expect(text).toContain(`${ROOT}/reports/${name}`);
    }
    expect(h.errOut()).toBe("");
  });

  it("9.7 exits 0 when spec mutants survive and when all are killed", async () => {
    expect(await runCli(["run", "--project", ROOT], harness().deps)).toBe(0);
    const killed = harness({ mutantSuite: killingSuite });
    expect(await runCli(["run", "--project", ROOT], killed.deps)).toBe(0);
    expect(killed.out()).toContain("Surviving spec mutants: 0");
    expect(killed.out()).toContain("guarded: 1");
  });

  it("9.1 run writes into the configured output directory", async () => {
    const h = harness();
    await runCli(["run", "--project", ROOT], h.deps);
    expect(h.files.has(`${ROOT}/reports/verdict.json`)).toBe(true);
    expect(h.files.has(`${ROOT}/reports/history.jsonl`)).toBe(true);
  });

  it("9.2 measure writes into the output directory given for the command", async () => {
    const h = harness();
    const code = await runCli(["measure", "--project", ROOT, "--output", "evidence"], h.deps);
    expect(code).toBe(0);
    for (const name of ["mutation-report.json", "verdict.json", "history.jsonl"]) {
      expect(h.files.has(`${CWD}/evidence/${name}`)).toBe(true);
      expect(h.files.has(`${ROOT}/reports/${name}`)).toBe(false);
    }
    expect(h.out()).toContain(`${CWD}/evidence/verdict.json`);
  });

  it("9.9 a configuration error prints to stderr and exits 1", async () => {
    const h = harness();
    h.files.set(`${ROOT}/trickortest.config.json`, "{ not json");
    const code = await runCli(["run", "--project", ROOT], h.deps);
    expect(code).toBe(1);
    expect(h.errOut()).toContain("trickortest.config.json");
    expect(h.out()).toBe("");
  });

  it("9.9 a parsing error names the file and exits 1", async () => {
    const h = harness();
    h.files.set(`${ROOT}/mutants/demo/oath-1.1-boundary.json`, "{}");
    const code = await runCli(["run", "--project", ROOT], h.deps);
    expect(code).toBe(1);
    expect(h.errOut()).toContain("oath-1.1-boundary.json");
  });

  it("9.9 a failing baseline lists the failing tests and exits 1", async () => {
    const h = harness({ baseline: ok(killingSuite) });
    const code = await runCli(["run", "--project", ROOT], h.deps);
    expect(code).toBe(1);
    expect(h.errOut()).toContain("test/a.test.ts::a");
    expect(h.files.has(`${ROOT}/reports/verdict.json`)).toBe(false);
  });

  it("9.9 a baseline run error exits 1", async () => {
    const h = harness({ baseline: err({ kind: "RunError", message: "no vitest" }) });
    expect(await runCli(["run", "--project", ROOT], h.deps)).toBe(1);
    expect(h.errOut()).toContain("no vitest");
  });

  it("9.9 a StrykerJS error prints its message and exits 1", async () => {
    const h = harness({ strykerError: "stryker exploded" });
    expect(await runCli(["run", "--project", ROOT], h.deps)).toBe(1);
    expect(h.errOut()).toContain("stryker exploded");
  });

  it("9.9 a runtime exception prints its message and exits 1", async () => {
    const h = harness({ throwInMechanical: true });
    expect(await runCli(["run", "--project", ROOT], h.deps)).toBe(1);
    expect(h.errOut()).toContain("boom");
  });

  it("9.9 a history file that does not parse exits 1 and names the line", async () => {
    const h = harness();
    h.files.set(`${ROOT}/reports/history.jsonl`, "not json\n");
    expect(await runCli(["run", "--project", ROOT], h.deps)).toBe(1);
    expect(h.errOut()).toContain("history.jsonl");
    expect(h.errOut()).toContain("line 1");
  });

  it("9.10 an unknown command prints the usage to stderr and exits 1", async () => {
    const h = harness();
    expect(await runCli(["frobnicate"], h.deps)).toBe(1);
    expect(h.errOut()).toContain("Unknown command: frobnicate");
    expect(h.errOut()).toContain(USAGE_TEXT);
    expect(h.out()).toBe("");
  });

  it("9.10 an unknown option prints the usage to stderr and exits 1", async () => {
    const h = harness();
    expect(await runCli(["run", "--bogus", "x"], h.deps)).toBe(1);
    expect(h.errOut()).toContain("Unknown option: --bogus");
    expect(h.errOut()).toContain(USAGE_TEXT);
  });

  it("9.10 --output is unknown for run", async () => {
    const h = harness();
    expect(await runCli(["run", "--output", "x"], h.deps)).toBe(1);
    expect(h.errOut()).toContain("Unknown option: --output");
  });
});
