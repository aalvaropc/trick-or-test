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
      name: "cart-pricing",
      requirementsPath: `${ROOT}/.kiro/specs/cart-pricing/requirements.md`,
      criteria: [
        {
          id: "1.1" as CriterionId,
          requirement: 1,
          criterion: 1,
          text: "THE system SHALL",
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

const FILES = new Map<string, string>([
  [
    `${ROOT}/test/a.test.ts`,
    [
      'it("one", () => {',
      "  expect(1).toBe(1);",
      "});",
      'describe("suite", () => {',
      '  it("inner", () => {',
      "    expect(2).toBe(2);",
      "  });",
      "});",
      'it("a > b", () => {',
      "  expect(3).toBe(3);",
      "});",
      'it.skip("skipped one", () => {',
      "  expect(4).toBe(4);",
      "});",
      "",
    ].join("\n"),
  ],
]);

// The Baseline_Run skipped "skipped one"; the other three tests passed.
const SUITE: SuiteResult = {
  durationMs: 100,
  files: [
    {
      path: "test/a.test.ts",
      tests: [
        { name: "one", status: "passed", startLine: 1 },
        { name: "suite inner", status: "passed", startLine: 5 },
        { name: "a > b", status: "passed", startLine: 9 },
        { name: "skipped one", status: "skipped", startLine: 12 },
      ],
    },
  ],
  testTitles: [[["one"], ["suite", "inner"], ["a > b"], ["skipped one"]]],
};

// StrykerJS spells the nested test "suite > inner"; t1 and t1b are two entries for one test.
const TEST_FILES: MechanicalRunResult["testFiles"] = {
  "test/a.test.ts": [
    { id: "t1", name: "one", startLine: 1 },
    { id: "t1b", name: "one", startLine: 1 },
    { id: "t2", name: "suite > inner", startLine: 5 },
    { id: "t3", name: "a > b", startLine: 9 },
    { id: "t4", name: "skipped one", startLine: 12 },
  ],
};

const mutant = (n: number, killedBy: string[]): MechanicalMutant => ({
  id: `m${n}`,
  file: "src/price.ts",
  mutatorName: "EqualityOperator",
  replacement: `<= ${n}`,
  original: "<",
  location: { start: { line: n, column: 1 }, end: { line: n, column: 2 } },
  startLine: n,
  endLine: n,
  status: "Killed",
  killedBy,
});

const MATCHED: MechanicalMutant[] = [
  mutant(1, ["t1"]),
  mutant(2, ["t2"]),
  mutant(3, ["t3"]),
  mutant(4, ["t1", "t1b"]),
];
const SKIPPED_KILLER = mutant(5, ["t4"]);

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
    // One test of the Baseline_Run and one file-level Failing_Test, whose id is the file path.
    killingTests: ["test/a.test.ts::one" as TestId, "test/a.test.ts" as TestId],
    killClass: "examples-only",
  },
  mutatedOutcome: { kind: "value", value: true },
};

const readFile = async (path: string) => {
  const text = FILES.get(path);
  return text === undefined ? err("ENOENT") : ok(text);
};

const adapters = (mutants: MechanicalMutant[]) =>
  ({
    fs: { readFile },
    suite: { run: async () => ok(SUITE) },
    mechanical: {
      run: async () => ok({ mutants, testFiles: TEST_FILES, ignoreStaticRetried: false }),
    },
    git: { diff: async () => ok("") },
  }) satisfies MechanicalAdapters;

/** Runs the CLI path (toOutcomes, writeReports) on a fake file system and reads verdict.json back. */
const runAndRead = async (mutants: MechanicalMutant[]) => {
  const staged = await runBaselineAndMechanical(
    { project: ROOT },
    project,
    { typescriptVersion: "7.0.2" },
    adapters(mutants),
  );
  if (!staged.ok) throw new Error(`stage failed: ${staged.error.kind}`);
  const stage = staged.value;
  const written = new Map<string, string>();
  const reportAdapters: ReportAdapters = {
    fs: {
      readFile,
      exists: async (path) => written.has(path) || FILES.has(path),
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
      mechanical: stage.mutants,
      specMutants: [specOutcome],
      ignoreStaticRetried: false,
      metadata,
      baselineTests: stage.baselineTests,
      baselineSources: stage.baselineSources,
      ...(stage.unmatchedKillingTests === undefined
        ? {}
        : { unmatchedKillingTests: stage.unmatchedKillingTests }),
    },
    reportAdapters,
  );
  const verdict = verdictSchema.parse(JSON.parse(written.get(`${OUT}/verdict.json`) as string));
  return { result, written, verdict };
};

const FILE_LEVEL = "test/a.test.ts";

describe("killing-test ids in the written verdict", () => {
  it("6.13 every killing test of every mutant is a Baseline_Test, except a file-level Failing_Test", async () => {
    const { result, verdict } = await runAndRead(MATCHED);
    expect(result.ok).toBe(true);
    const baselineIds = new Set<string>((verdict.baselineTests ?? []).map((t) => t.id));
    // The skipped test is not a Baseline_Test.
    expect([...baselineIds].sort()).toEqual([
      "test/a.test.ts::a > b",
      "test/a.test.ts::one",
      "test/a.test.ts::suite inner",
    ]);
    const outside = verdict.mutants
      .flatMap((m) => m.killingTests)
      .filter((id) => id !== FILE_LEVEL && !baselineIds.has(id));
    expect(outside).toEqual([]);
    expect(verdict.mutants.flatMap((m) => m.killingTests)).toContain(FILE_LEVEL);
    expect(verdict.unmatchedKillingTests).toBe(0);
  });

  it("6.13 a title that contains ' > ' is matched to its Baseline_Test", async () => {
    const { verdict } = await runAndRead(MATCHED);
    const ids = verdict.mutants.filter((m) => m.species !== "Oathbreaker");
    const byKiller = ids.map((m) => m.killingTests);
    expect(byKiller).toContainEqual(["test/a.test.ts::a > b"]);
    // StrykerJS "suite > inner" is the Baseline_Test "suite inner".
    expect(byKiller).toContainEqual(["test/a.test.ts::suite inner"]);
  });

  it("6.13 two killers of one mutant that match one Baseline_Test give two entries, one for each killer", async () => {
    const { verdict } = await runAndRead(MATCHED);
    const mutants = verdict.mutants.filter((m) => m.species !== "Oathbreaker");
    // The list has one entry for each StrykerJS killer, in killedBy order, with no merging.
    expect(mutants.map((m) => m.killingTests)).toContainEqual([
      "test/a.test.ts::one",
      "test/a.test.ts::one",
    ]);
  });

  it("6.15 a killer whose test the Baseline_Run skipped keeps its StrykerJS name, is counted, and the run completes", async () => {
    const { result, written, verdict } = await runAndRead([...MATCHED, SKIPPED_KILLER]);
    expect(result.ok).toBe(true);
    expect(verdict.unmatchedKillingTests).toBe(1);
    const lists = verdict.mutants.map((m) => m.killingTests);
    expect(lists).toContainEqual(["test/a.test.ts::skipped one"]);
    const baselineIds = new Set<string>((verdict.baselineTests ?? []).map((t) => t.id));
    expect(baselineIds.has("test/a.test.ts::skipped one")).toBe(false);
    expect([...written.keys()].sort()).toEqual([
      `${OUT}/history.jsonl`,
      `${OUT}/mutation-report.json`,
      `${OUT}/verdict.json`,
    ]);
  });
});
