import { describe, expect, it } from "vitest";
import type { MechanicalMutant, MechanicalRunResult } from "../../src/adapters/stryker-adapter.js";
import type { SuiteResult } from "../../src/adapters/vitest-suite-runner.js";
import {
  type LoadedProject,
  type MechanicalAdapters,
  type ReportAdapters,
  runBaselineAndMechanical,
  type SpecMutantOutcome,
  writeReports,
} from "../../src/cli/orchestrate.js";
import { toTestId } from "../../src/core/baseline-tests.js";
import { verdictSchema } from "../../src/core/report.js";
import { err, ok } from "../../src/core/result.js";
import type {
  CriterionId,
  MutantId,
  RunMetadata,
  SpecMutant,
  TestId,
} from "../../src/core/types.js";

const ROOT = "/proj";
const OUT = `${ROOT}/reports`;

const project: LoadedProject = {
  config: {
    specDir: `${ROOT}/.kiro/specs`,
    sourceGlobs: ["src/**/*.ts"],
    testGlobs: ["test/**/*.test.ts"],
    propertyTestGlobs: ["test/**/*.property.test.ts"],
    mutantsDir: `${ROOT}/mutants`,
    outputDir: OUT,
  },
  specs: [
    {
      name: "demo",
      requirementsPath: `${ROOT}/.kiro/specs/demo/requirements.md`,
      criteria: [
        {
          id: "1.1" as CriterionId,
          requirement: 1,
          criterion: 1,
          text: "THE system SHALL reject 10",
          line: 1,
        },
      ],
      mutants: [],
      skipEntries: [],
    },
  ],
};

const metadata: RunMetadata = {
  gitCommit: "abc",
  seed: 1,
  engineVersion: "0.0.0",
  nodeVersion: "v24",
  strykerVersion: "10.1.1",
  vitestVersion: "5.1.0",
  typescriptVersion: "7.0.2",
  timestamp: "2026-01-01T00:00:00.000Z",
};

const SOURCE = "export const f = (a: number) => a < 10;\n";
const FILES = new Map<string, string>([
  [`${ROOT}/src/f.ts`, SOURCE],
  [
    `${ROOT}/test/a.test.ts`,
    'it("one", () => {\n  expect(1).toBe(1);\n});\nit("two", () => {\n  expect(2).toBe(2);\n});\nit.skip("three", () => {\n  expect(3).toBe(3);\n});\n',
  ],
  [`${ROOT}/test/b.property.test.ts`, 'it("prop", () => {\n  expect(1).toBe(1);\n});\n'],
]);

const suite: SuiteResult = {
  durationMs: 100,
  files: [
    {
      path: "test/a.test.ts",
      tests: [
        { name: "one", status: "passed", startLine: 1 },
        { name: "two", status: "passed", startLine: 4 },
        { name: "three", status: "skipped", startLine: 7 },
      ],
    },
    {
      path: "test/b.property.test.ts",
      tests: [{ name: "prop", status: "passed", startLine: 1 }],
    },
  ],
};

const mutant: MechanicalMutant = {
  id: "m1",
  file: "src/f.ts",
  mutatorName: "EqualityOperator",
  replacement: "<=",
  original: "<",
  location: { start: { line: 1, column: 35 }, end: { line: 1, column: 36 } },
  startLine: 1,
  endLine: 1,
  status: "Killed",
  killedBy: ["t1", "t2"],
};

const runResult: MechanicalRunResult = {
  mutants: [mutant],
  testFiles: {
    "test/a.test.ts": [
      { id: "t1", name: "one", startLine: 1 },
      { id: "t2", name: "two", startLine: 4 },
    ],
  },
  ignoreStaticRetried: false,
};

const specOutcome: SpecMutantOutcome = {
  mutant: {
    id: "oath-1.1-a" as MutantId,
    requirement: "1.1" as CriterionId,
    file: "src/f.ts",
    original: "a < 10",
    mutated: "a <= 10",
    why: "boundary",
    witness: { from: "src/f.ts", export: "f", args: [10], expected: false },
  } satisfies SpecMutant,
  result: {
    id: "oath-1.1-a" as MutantId,
    species: "Oathbreaker",
    status: "Killed",
    requirement: "1.1" as CriterionId,
    killingTests: [
      toTestId("test/b.property.test.ts", "prop"),
      // A file-level failure is named after its file, so it is not a baseline test id.
      "test/c.test.ts" as TestId,
    ],
    killClass: "properties-only",
  },
  mutatedOutcome: { kind: "value", value: true },
};

const run = async () => {
  const written = new Map<string, string>();
  const mechanicalAdapters: MechanicalAdapters = {
    fs: {
      async readFile(path) {
        const text = FILES.get(path);
        return text === undefined ? err("ENOENT") : ok(text);
      },
    },
    suite: { run: async () => ok(suite) },
    mechanical: { run: async () => ok(runResult) },
    git: { diff: async () => ok("") },
  };
  const stage = await runBaselineAndMechanical(
    { project: ROOT },
    project,
    { typescriptVersion: "7.0.2" },
    mechanicalAdapters,
  );
  if (!stage.ok) throw new Error(`stage failed: ${stage.error.kind}`);
  const reportAdapters: ReportAdapters = {
    fs: {
      readFile: mechanicalAdapters.fs.readFile,
      async exists(path) {
        return written.has(path) || FILES.has(path);
      },
      async writeFile(path, content) {
        written.set(path, content);
        return ok(undefined);
      },
    },
  };
  const result = await writeReports(
    { project: ROOT },
    project,
    {
      mechanical: stage.value.mutants,
      specMutants: [specOutcome],
      ignoreStaticRetried: stage.value.ignoreStaticRetried,
      metadata,
      baselineTests: stage.value.baselineTests,
    },
    reportAdapters,
  );
  expect(result.ok).toBe(true);
  return verdictSchema.parse(JSON.parse(written.get(`${OUT}/verdict.json`) as string));
};

describe("baseline tests carried to the verdict", () => {
  it("6.11 the length of baselineTests equals the passed tests of the Baseline_Run", async () => {
    const verdict = await run();
    const passed = suite.files.flatMap((f) => f.tests).filter((t) => t.status === "passed");
    expect(verdict.baselineTests).toHaveLength(passed.length);
  });

  it("6.11 a skipped test is absent from baselineTests", async () => {
    const verdict = await run();
    const ids = (verdict.baselineTests ?? []).map((t) => t.id);
    expect(ids).not.toContain(toTestId("test/a.test.ts", "three"));
  });

  it("6.12 a test of a property file has kind property and the others have kind example", async () => {
    const verdict = await run();
    const kinds = Object.fromEntries((verdict.baselineTests ?? []).map((t) => [t.id, t.kind]));
    expect(kinds).toEqual({
      "test/a.test.ts::one": "example",
      "test/a.test.ts::two": "example",
      "test/b.property.test.ts::prop": "property",
    });
  });

  it("6.13 every killing test id of every mutant is in baselineTests, except a file path", async () => {
    const verdict = await run();
    const ids = new Set((verdict.baselineTests ?? []).map((t) => t.id as string));
    const killing = verdict.mutants.flatMap((m) => m.killingTests as string[]);
    expect(killing).toContain("test/c.test.ts");
    expect(killing.length).toBeGreaterThan(1);
    for (const id of killing) {
      if (id === "test/c.test.ts") continue;
      expect(ids.has(id)).toBe(true);
    }
  });
});
