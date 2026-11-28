import { describe, expect, it } from "vitest";
import type { MechanicalMutant, MechanicalRunResult } from "../../src/adapters/stryker-adapter.js";
import { extractTestBody } from "../../src/adapters/test-body-extractor.js";
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
import { computeKillClass } from "../../src/core/kill-classification.js";
import { verdictSchema } from "../../src/core/report.js";
import { err, ok } from "../../src/core/result.js";
import { classifyTest, type TestKind } from "../../src/core/test-classification.js";
import type {
  CriterionId,
  KillClass,
  MutantId,
  RunMetadata,
  SpecMutant,
} from "../../src/core/types.js";

const ROOT = "/proj";
const OUT = `${ROOT}/reports`;
const GLOBS = ["test/**/*.property.test.ts"];

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
    propertyTestGlobs: GLOBS,
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
      'describe("suite", () => {',
      '  it("inner", () => {',
      "    expect(2).toBe(2);",
      "  });",
      "});",
      "",
    ].join("\n"),
  ],
  [`${ROOT}/test/b.property.test.ts`, 'it("prop", () => {\n  expect(3).toBe(3);\n});\n'],
  [`${ROOT}/test/c.test.ts`, 'it("body prop", () => {\n  fc.assert(p);\n});\n'],
]);

const TITLES = [[["one"], ["suite", "inner"]], [["prop"]], [["body prop"]]];

const suiteOf = (withTitles: boolean): SuiteResult => ({
  durationMs: 100,
  files: [
    {
      path: "test/a.test.ts",
      tests: [
        { name: "one", status: "passed", startLine: 3 },
        { name: "suite inner", status: "passed", startLine: 7 },
      ],
    },
    { path: "test/b.property.test.ts", tests: [{ name: "prop", status: "passed", startLine: 1 }] },
    { path: "test/c.test.ts", tests: [{ name: "body prop", status: "passed", startLine: 1 }] },
  ],
  ...(withTitles ? { testTitles: TITLES } : {}),
});

const mutant = (n: number, killedBy: string[], status = "Killed"): MechanicalMutant => ({
  id: `m${n}`,
  file: "src/price.ts",
  mutatorName: "EqualityOperator",
  replacement: `<= ${n}`,
  original: "<",
  location: { start: { line: n, column: 1 }, end: { line: n, column: 2 } },
  startLine: n,
  endLine: n,
  status,
  killedBy,
});

// t1 example, t2 nested example (StrykerJS spells it with ' > '), t3 property file,
// t4 property body in an example file, t5 a killer that is not a Baseline_Test, t9 unknown.
const TEST_FILES: MechanicalRunResult["testFiles"] = {
  "test/a.test.ts": [
    { id: "t1", name: "one", startLine: 3 },
    { id: "t2", name: "suite > inner", startLine: 7 },
    { id: "t5", name: "gone", startLine: 99 },
  ],
  "test/b.property.test.ts": [{ id: "t3", name: "prop", startLine: 1 }],
  "test/c.test.ts": [{ id: "t4", name: "body prop", startLine: 1 }],
};

const MUTANTS: MechanicalMutant[] = [
  mutant(1, ["t1"]),
  mutant(2, ["t2"]),
  mutant(3, ["t3"]),
  mutant(4, ["t4"]),
  mutant(5, ["t5"]),
  mutant(6, ["t1", "t3", "t5"]),
  mutant(7, []),
  mutant(8, ["t9"]),
  mutant(9, [], "Survived"),
];

const readFile = async (path: string) => {
  const text = FILES.get(path);
  return text === undefined ? err("ENOENT") : ok(text);
};

type Calls = { mechanical: number };

const adapters = (suite: SuiteResult, mutants: MechanicalMutant[], calls: Calls) =>
  ({
    fs: { readFile },
    suite: { run: async () => ok(suite) },
    mechanical: {
      run: async () => {
        calls.mechanical += 1;
        return ok({ mutants, testFiles: TEST_FILES, ignoreStaticRetried: false });
      },
    },
    git: { diff: async () => ok("") },
  }) satisfies MechanicalAdapters;

const stageOf = async (
  suite: SuiteResult,
  mutants: MechanicalMutant[],
  options: { scope?: "spec-only" } = {},
) => {
  const calls: Calls = { mechanical: 0 };
  const stage = await runBaselineAndMechanical(
    { project: ROOT, ...options },
    project,
    { typescriptVersion: "7.0.2" },
    adapters(suite, mutants, calls),
  );
  if (!stage.ok) throw new Error(`stage failed: ${stage.error.kind}`);
  return { stage: stage.value, calls };
};

const kindOfKiller = (file: string, startLine: number): TestKind =>
  classifyTest(
    { filePath: file, bodySource: extractTestBody(FILES.get(`${ROOT}/${file}`) ?? "", startLine) },
    GLOBS,
  );

const byId = new Map(
  Object.entries(TEST_FILES).flatMap(([file, list]) => list.map((t) => [t.id, { file, ...t }])),
);

describe("ids of the killing tests of mechanical mutants", () => {
  it("6.14 a killer is replaced by the id of its Baseline_Test", async () => {
    const { stage } = await stageOf(suiteOf(true), MUTANTS);
    const ids = stage.mutants.map((m) => m.result.killingTests);
    expect(ids[0]).toEqual(["test/a.test.ts::one"]);
    // StrykerJS spells the nested test with ' > '; the Baseline_Test id joins with a space.
    expect(ids[1]).toEqual(["test/a.test.ts::suite inner"]);
    expect(ids[2]).toEqual(["test/b.property.test.ts::prop"]);
    expect(ids[3]).toEqual(["test/c.test.ts::body prop"]);
  });

  it("6.15 an unmatched killer keeps the StrykerJS-style id and is counted per mutant and test", async () => {
    const { stage } = await stageOf(suiteOf(true), MUTANTS);
    const ids = stage.mutants.map((m) => m.result.killingTests);
    expect(ids[4]).toEqual([toTestId("test/a.test.ts", "gone")]);
    expect(ids[5]).toEqual([
      "test/a.test.ts::one",
      "test/b.property.test.ts::prop",
      "test/a.test.ts::gone",
    ]);
    // Mutants 5 and 6 each have one unmatched killer.
    expect(stage.unmatchedKillingTests).toBe(2);
  });

  it("6.13 Kill_Class of every mechanical mutant and the four counts are unchanged", async () => {
    const { stage } = await stageOf(suiteOf(true), MUTANTS);
    // Old route: the kind of each killer comes from the StrykerJS file and body.
    const expected: (KillClass | undefined)[] = MUTANTS.map((m) => {
      if (m.status !== "Killed") return undefined;
      const kinds = m.killedBy.flatMap((id) => {
        const t = byId.get(id);
        return t === undefined ? [] : [{ kind: kindOfKiller(t.file, t.startLine ?? 1) }];
      });
      return computeKillClass(kinds);
    });
    expect(stage.mutants.map((m) => m.result.killClass)).toEqual(expected);
    const count = (list: (KillClass | undefined)[]) => {
      const out: Record<string, number> = {};
      for (const c of list) if (c !== undefined) out[c] = (out[c] ?? 0) + 1;
      return out;
    };
    expect(count(stage.mutants.map((m) => m.result.killClass))).toEqual(count(expected));
    // Mutant 4: a property body in an example file; mutant 3: a property file.
    expect(stage.mutants[2]?.result.killClass).toBe("properties-only");
    expect(stage.mutants[3]?.result.killClass).toBe("properties-only");
    expect(stage.mutants[0]?.result.killClass).toBe("examples-only");
    // A Killed mutant with an empty killing-test list keeps the class of an empty list.
    expect(stage.mutants[6]?.result.killClass).toBe(computeKillClass([]));
  });

  it("6.13 the kind of every matched Baseline_Test equals the kind of its killer", async () => {
    const { stage } = await stageOf(suiteOf(true), MUTANTS);
    const kindById = new Map(stage.baselineTests.map((t) => [t.id as string, t.kind]));
    const differing: string[] = [];
    for (const [i, m] of MUTANTS.entries()) {
      if (m.status !== "Killed") continue;
      const killers = m.killedBy.flatMap((id) => {
        const t = byId.get(id);
        return t === undefined ? [] : [t];
      });
      const ids = stage.mutants[i]?.result.killingTests ?? [];
      for (const [j, killer] of killers.entries()) {
        const baselineKind = kindById.get(ids[j] as string);
        if (baselineKind === undefined) continue; // unmatched killer
        const killerKind = kindOfKiller(killer.file, killer.startLine ?? 1);
        if (baselineKind !== killerKind)
          differing.push(`${ids[j]}: ${baselineKind} vs ${killerKind}`);
      }
    }
    expect(differing).toEqual([]);
  });

  it("6.14 without testTitles a top-level killer matches and a nested killer is counted unmatched", async () => {
    const { stage } = await stageOf(suiteOf(false), MUTANTS.slice(0, 2));
    expect(stage.mutants[0]?.result.killingTests).toEqual(["test/a.test.ts::one"]);
    expect(stage.mutants[1]?.result.killingTests).toEqual(["test/a.test.ts::suite > inner"]);
    expect(stage.unmatchedKillingTests).toBe(1);
  });

  it("8.29 a spec-only run has no count and never starts StrykerJS", async () => {
    const { stage, calls } = await stageOf(suiteOf(true), MUTANTS, { scope: "spec-only" });
    expect(calls.mechanical).toBe(0);
    expect(stage.mutants).toEqual([]);
    expect(stage).not.toHaveProperty("unmatchedKillingTests");
  });

  it("8.29 a full run with no mechanical killer reports 0", async () => {
    const { stage } = await stageOf(suiteOf(true), [mutant(1, [], "Survived")]);
    expect(stage.unmatchedKillingTests).toBe(0);
  });
});

describe("claims do not change when mechanical killers are matched", () => {
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

  const verdictOf = async (mutants: MechanicalMutant[]) => {
    const { stage } = await stageOf(suiteOf(true), mutants);
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
    expect(result.ok).toBe(true);
    return verdictSchema.parse(JSON.parse(written.get(`${OUT}/verdict.json`) as string));
  };

  it("11.16 claim counts are the same with matched mechanical killers as without mechanical mutants", async () => {
    const without = await verdictOf([]);
    const matched = await verdictOf(MUTANTS.slice(0, 4));
    expect(matched.claimCounts).toEqual(without.claimCounts);
    expect(matched.claimCounts).toMatchObject({
      total: 3,
      held: 1,
      notHeld: 0,
      unchecked: 1,
      unknownCriterion: 1,
    });
    expect(matched.baselineTests).toEqual(without.baselineTests);
    expect(matched.unmatchedKillingTests).toBe(0);
    expect(without.unmatchedKillingTests).toBe(0);
  });

  it("8.29 the verdict of a full run carries the count of unmatched killers", async () => {
    const verdict = await verdictOf(MUTANTS);
    expect(verdict.unmatchedKillingTests).toBe(2);
  });
});
