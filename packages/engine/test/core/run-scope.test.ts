import { describe, expect, it } from "vitest";
import { buildHistoryRecord } from "../../src/core/report.js";
import { scopeOf, selectComparisonRecord } from "../../src/core/run-scope.js";
import type {
  CriterionId,
  EngineConfig,
  HistoryRecord,
  MutantId,
  MutantResult,
  MutantStatus,
  RunScope,
  Verdict,
} from "../../src/core/types.js";

const config: EngineConfig = {
  specDir: ".kiro/specs/x",
  sourceGlobs: ["src/**/*.ts"],
  testGlobs: ["test/**/*.test.ts"],
  propertyTestGlobs: ["test/**/*.property.test.ts"],
  mutantsDir: "mutants",
  outputDir: "out",
};

const spec = (id: string, status: MutantStatus): MutantResult => ({
  id: id as MutantId,
  species: "Oathbreaker",
  status,
  requirement: "1.1" as CriterionId,
  killingTests: [],
});

const stray = (id: string, status: MutantStatus): MutantResult => ({
  id: id as MutantId,
  species: "Borderling",
  status,
  killingTests: [],
});

const verdictOf = (mutants: MutantResult[], scope?: RunScope): Verdict => ({
  coverage: [{ criterion: "1.1" as CriterionId, status: "guarded" }],
  mutants,
  witnesses: {},
  ignoreStaticRetried: false,
  metadata: {
    gitCommit: "abc123",
    seed: 1,
    engineVersion: "0.1.0",
    nodeVersion: "22.0.0",
    strykerVersion: "9.0.0",
    vitestVersion: "2.0.0",
    typescriptVersion: "5.0.0",
    timestamp: "2025-01-01T00:00:00.000Z",
    ...(scope === undefined ? {} : { scope }),
  },
});

const build = (v: Verdict, prev?: HistoryRecord): HistoryRecord => {
  const r = buildHistoryRecord(v, prev, config, "/proj");
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const record = (seed: number, scope?: RunScope): HistoryRecord => ({
  ...build(verdictOf([spec("oath-1.1-a", "Killed")])),
  seed,
  ...(scope === undefined ? {} : { scope }),
});

describe("run scope", () => {
  it("8.28 a record with no scope is full", () => {
    expect(scopeOf(record(1))).toBe("full");
    expect(scopeOf(record(1, "spec-only"))).toBe("spec-only");
    expect(scopeOf(record(1, "full"))).toBe("full");
  });

  it("8.30 a full run after full, spec-only gets the first record", () => {
    const first = record(1, "full");
    const second = record(2, "spec-only");
    expect(selectComparisonRecord([first, second], "full")).toBe(first);
  });

  it("8.30 a full run with no full record gets none", () => {
    expect(selectComparisonRecord([record(1, "spec-only")], "full")).toBeUndefined();
  });

  it("8.30 a spec-only run gets the latest record of either scope", () => {
    const first = record(1, "full");
    const second = record(2, "spec-only");
    expect(selectComparisonRecord([first, second], "spec-only")).toBe(second);
    expect(selectComparisonRecord([second, first], "spec-only")).toBe(first);
  });

  it("8.30 an empty list gives none", () => {
    expect(selectComparisonRecord([], "full")).toBeUndefined();
    expect(selectComparisonRecord([], "spec-only")).toBeUndefined();
  });

  it("8.30 a full run after a spec-only record does not list mechanical ids the last full record had as killed", () => {
    // Writing `scope` into the record is task 19.4, so the test sets it here.
    const lastFull: HistoryRecord = {
      ...build(verdictOf([spec("oath-1.1-a", "Killed"), stray("m1", "Killed")], "full")),
      scope: "full",
    };
    const specOnly: HistoryRecord = {
      ...build(verdictOf([spec("oath-1.1-a", "Killed")], "spec-only")),
      scope: "spec-only",
    };
    const chosen = selectComparisonRecord([lastFull, specOnly], "full");
    const now = build(
      verdictOf([spec("oath-1.1-a", "Killed"), stray("m1", "Killed")], "full"),
      chosen,
    );
    expect(now.newlyKilledIds).toEqual([]);
  });

  it("8.30 a spec-only record lists no mechanical id in newlyKilledIds", () => {
    const rec = build(
      verdictOf([spec("oath-1.1-a", "Killed"), stray("m1", "Killed")], "spec-only"),
    );
    expect(rec.newlyKilledIds).toEqual(["oath-1.1-a"]);
  });

  it("8.30 a spec-only run ignores mechanical ids killed in the comparison record", () => {
    const prev = build(verdictOf([spec("oath-1.1-a", "Survived"), stray("m1", "Killed")], "full"));
    const rec = build(verdictOf([spec("oath-1.1-a", "Killed")], "spec-only"), prev);
    expect(rec.newlyKilledIds).toEqual(["oath-1.1-a"]);
  });

  it("8.9 two runs of one scope give the 8.9 result", () => {
    for (const scope of ["full", "spec-only"] as const) {
      const prev = build(
        verdictOf([spec("oath-1.1-a", "Killed"), spec("oath-1.1-b", "Survived")], scope),
      );
      const rec = build(
        verdictOf(
          [
            spec("oath-1.1-a", "Killed"),
            spec("oath-1.1-b", "Killed"),
            spec("oath-1.1-c", "Killed"),
          ],
          scope,
        ),
        prev,
      );
      expect(rec.newlyKilledIds).toEqual(["oath-1.1-b", "oath-1.1-c"]);
    }
  });
});
