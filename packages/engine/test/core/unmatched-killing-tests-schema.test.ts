import { describe, expect, it } from "vitest";
import type { SuiteResult } from "../../src/adapters/vitest-suite-runner.js";
import { type CliDeps, runCli } from "../../src/cli/main.js";
import { buildVerdict, type VerdictInput, verdictSchema } from "../../src/core/report.js";
import { err, ok } from "../../src/core/result.js";
import type { RunMetadata } from "../../src/core/types.js";
import { verdictSchema as publicVerdictSchema } from "../../src/report/index.js";

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

const minimal = (): VerdictInput => ({
  coverage: [],
  mutants: [],
  witnesses: {},
  ignoreStaticRetried: false,
  projectRoot: "/proj",
  metadata,
});

const built = (input: VerdictInput) => {
  const r = buildVerdict(input);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("unmatchedKillingTests in the verdict", () => {
  it("8.29 a verdict without the field parses", () => {
    expect(verdictSchema.safeParse(built(minimal())).success).toBe(true);
  });

  it("8.29 a verdict with the field parses, also through trick-or-test/report", () => {
    const verdict = { ...built(minimal()), unmatchedKillingTests: 3 };
    expect(verdictSchema.safeParse(verdict).success).toBe(true);
    expect(publicVerdictSchema.safeParse(verdict).success).toBe(true);
    expect(verdictSchema.safeParse({ ...verdict, unmatchedKillingTests: 0 }).success).toBe(true);
  });

  it("8.29 a negative or fractional count is rejected", () => {
    const verdict = built(minimal());
    expect(verdictSchema.safeParse({ ...verdict, unmatchedKillingTests: -1 }).success).toBe(false);
    expect(verdictSchema.safeParse({ ...verdict, unmatchedKillingTests: 1.5 }).success).toBe(false);
  });

  it("8.29 buildVerdict writes the count only when its input carries it", () => {
    expect(built(minimal())).not.toHaveProperty("unmatchedKillingTests");
    expect(built({ ...minimal(), unmatchedKillingTests: 0 }).unmatchedKillingTests).toBe(0);
    expect(built({ ...minimal(), unmatchedKillingTests: 4 }).unmatchedKillingTests).toBe(4);
  });

  it("8.29 buildVerdict does not decide by the scope alone", () => {
    expect(built({ ...minimal(), scope: "full" })).not.toHaveProperty("unmatchedKillingTests");
  });
});

const ROOT = "/work/proj";
const REQUIREMENTS = `# Requirements
### Requirement 1: Pricing
#### Acceptance Criteria
1. THE Cart SHALL compare below ten.
`;
const TEST_FILE = 'it("a", () => {\n  expect(1).toBe(1);\n});\n';
const passing: SuiteResult = {
  durationMs: 10,
  files: [{ path: "test/a.test.ts", tests: [{ name: "a", status: "passed", startLine: 1 }] }],
};

const harness = () => {
  const files = new Map<string, string>([
    [`${ROOT}/.kiro/specs/demo/requirements.md`, REQUIREMENTS],
    [`${ROOT}/test/a.test.ts`, TEST_FILE],
  ]);
  const out: string[] = [];
  const isDir = (path: string): boolean => [...files.keys()].some((f) => f.startsWith(`${path}/`));
  const deps: CliDeps = {
    cwd: "/work",
    stdout: (text) => out.push(text),
    stderr: () => {},
    fs: {
      async readFile(path) {
        const text = files.get(path);
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
    suite: { run: async () => ok(passing) },
    mechanical: {
      run: async () => ok({ mutants: [], testFiles: {}, ignoreStaticRetried: false }),
    },
    git: { diff: async () => ok("") },
    sandbox: () => ({
      create: async (_root, id) => ok({ root: `${ROOT}/.trickortest/sandboxes/${id}` }),
      destroy: async () => ok(undefined),
    }),
    typecheck: { run: async () => ok(undefined) },
    witness: { run: async () => ok({}) },
    metadata: async () => metadata,
  };
  const verdict = (): Record<string, unknown> =>
    JSON.parse(files.get(`${ROOT}/reports/verdict.json`) ?? "null");
  return { deps, out: () => out.join(""), verdict };
};

describe("unmatchedKillingTests in the CLI", () => {
  it("8.29 a full run prints the summary line and writes the count 0", async () => {
    const h = harness();
    expect(await runCli(["run", "--project", ROOT, "--scope", "full"], h.deps)).toBe(0);
    expect(h.out()).toContain("killing tests outside the baseline: 0");
    expect(h.verdict().unmatchedKillingTests).toBe(0);
  });

  it("8.29 a spec-only run prints no such line and writes no count", async () => {
    const h = harness();
    expect(await runCli(["run", "--project", ROOT, "--scope", "spec-only"], h.deps)).toBe(0);
    expect(h.out()).not.toContain("killing tests outside the baseline");
    expect(h.verdict()).not.toHaveProperty("unmatchedKillingTests");
  });
});
