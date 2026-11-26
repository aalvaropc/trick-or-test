import { describe, expect, it } from "vitest";
import type { MechanicalRunResult } from "../../src/adapters/stryker-adapter.js";
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
import type { CriterionId, MutantId, RunMetadata, SpecMutant } from "../../src/core/types.js";

const ROOT = "/proj";
const OUT = `${ROOT}/reports`;

const criterion = (requirement: number, n: number) => ({
  id: `${requirement}.${n}` as CriterionId,
  requirement,
  criterion: n,
  text: `THE system SHALL do ${requirement}.${n}`,
  line: 1,
});

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
      criteria: [criterion(1, 1), criterion(1, 2)],
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
      "// Feature: cart-pricing",
      "// Validates: Requirements 1.1, 1.2, 9.9",
      'it("one", () => {',
      "  expect(1).toBe(1);",
      "});",
      'it("two", () => {',
      "  expect(2).toBe(2);",
      "});",
      "",
    ].join("\n"),
  ],
  [
    `${ROOT}/test/other.test.ts`,
    [
      "// Feature: another-spec",
      "// Validates: Requirements 1.1",
      'it("three", () => {',
      "  expect(3).toBe(3);",
      "});",
      "",
    ].join("\n"),
  ],
  // test/gone.test.ts is in the suite result but cannot be read.
]);

const suite: SuiteResult = {
  durationMs: 100,
  files: [
    {
      path: "test/a.test.ts",
      tests: [
        { name: "one", status: "passed", startLine: 3 },
        { name: "two", status: "passed", startLine: 6 },
      ],
    },
    { path: "test/other.test.ts", tests: [{ name: "three", status: "passed", startLine: 3 }] },
    { path: "test/gone.test.ts", tests: [{ name: "four", status: "passed", startLine: 3 }] },
  ],
};

const runResult: MechanicalRunResult = { mutants: [], testFiles: {}, ignoreStaticRetried: false };

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
    killingTests: [toTestId("test/a.test.ts", "one")],
    killClass: "examples-only",
  },
  mutatedOutcome: { kind: "value", value: true },
};

const run = async () => {
  const written = new Map<string, string>();
  const readFile = async (path: string) => {
    const text = FILES.get(path);
    return text === undefined ? err("ENOENT") : ok(text);
  };
  const mechanicalAdapters: MechanicalAdapters = {
    fs: { readFile },
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
      readFile,
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
      baselineSources: stage.value.baselineSources,
    },
    reportAdapters,
  );
  expect(result.ok).toBe(true);
  return {
    verdict: verdictSchema.parse(JSON.parse(written.get(`${OUT}/verdict.json`) as string)),
    files: [...written.keys()].sort(),
  };
};

describe("claims read in the pipeline", () => {
  it("11.12 a test file naming the attacked spec gives claims to the entries of its tests", async () => {
    const { verdict } = await run();
    const one = verdict.baselineTests?.find((t) => t.id === "test/a.test.ts::one");
    expect(one?.claims).toEqual([
      { criterion: "1.1", outcome: "held" },
      { criterion: "1.2", outcome: "unchecked" },
      { criterion: "9.9", outcome: "unknown-criterion" },
    ]);
  });

  it("11.12 a test with no comment above it has no claims key", async () => {
    const { verdict } = await run();
    const two = verdict.baselineTests?.find((t) => t.id === "test/a.test.ts::two");
    expect(two).toBeDefined();
    expect(two).not.toHaveProperty("claims");
  });

  it("11.2 a file that names another spec gives no claims", async () => {
    const { verdict } = await run();
    const three = verdict.baselineTests?.find((t) => t.id === "test/other.test.ts::three");
    expect(three).toBeDefined();
    expect(three).not.toHaveProperty("claims");
  });

  it("11.14 an unreadable file gives no claims and the run still writes the three files", async () => {
    const { verdict, files } = await run();
    const four = verdict.baselineTests?.find((t) => t.id === "test/gone.test.ts::four");
    expect(four).toBeDefined();
    expect(four).not.toHaveProperty("claims");
    expect(files).toEqual([
      `${OUT}/history.jsonl`,
      `${OUT}/mutation-report.json`,
      `${OUT}/verdict.json`,
    ]);
  });

  it("11.12 claimCounts.total equals the number of claims in baselineTests", async () => {
    const { verdict } = await run();
    const claims = (verdict.baselineTests ?? []).flatMap((t) => t.claims ?? []);
    expect(claims).toHaveLength(3);
    expect(verdict.claimCounts).toEqual({
      total: 3,
      held: 1,
      notHeld: 0,
      unchecked: 1,
      unknownCriterion: 1,
      notHeldOthersKilledAll: 0,
      notHeldOthersDidNot: 0,
    });
  });
});
