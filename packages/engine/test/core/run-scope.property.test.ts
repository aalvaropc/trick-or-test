// Property 34: History comparison across scopes. Validates: Requirements 8.9, 8.28, 8.30
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildHistoryRecord } from "../../src/core/report.js";
import { selectComparisonRecord } from "../../src/core/run-scope.js";
import type {
  CriterionId,
  EngineConfig,
  HistoryRecord,
  MutantId,
  MutantResult,
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

const SPEC_IDS = ["oath-1.1-a", "oath-1.1-b", "oath-1.1-c", "oath-1.1-d"];
const MECH_IDS = ["m1", "m2", "m3", "m4"];
const ALL_IDS = [...SPEC_IDS, ...MECH_IDS];

type Run = { id: string; killed: boolean }[];

// A run: each id independently absent, killed or surviving.
const runArb: fc.Arbitrary<Run> = fc
  .array(fc.constantFrom("absent", "killed", "survived"), {
    minLength: ALL_IDS.length,
    maxLength: ALL_IDS.length,
  })
  .map((states) =>
    states.flatMap((s, i) =>
      s === "absent" ? [] : [{ id: ALL_IDS[i] as string, killed: s === "killed" }],
    ),
  );

const scopeArb = fc.constantFrom<RunScope | undefined>(undefined, "full", "spec-only");

const resultsOf = (run: Run): MutantResult[] =>
  run.map((r) => ({
    id: r.id as MutantId,
    species: r.id.startsWith("oath-") ? "Oathbreaker" : "Borderling",
    status: r.killed ? "Killed" : "Survived",
    ...(r.id.startsWith("oath-") ? { requirement: "1.1" as CriterionId } : {}),
    killingTests: [],
  }));

const verdictOf = (run: Run, scope: RunScope): Verdict => ({
  coverage: [{ criterion: "1.1" as CriterionId, status: "guarded" }],
  mutants: resultsOf(run),
  witnesses: {},
  ignoreStaticRetried: false,
  metadata: {
    gitCommit: "abc123",
    seed: 42,
    engineVersion: "0.1.0",
    nodeVersion: "22.0.0",
    strykerVersion: "9.0.0",
    vitestVersion: "2.0.0",
    typescriptVersion: "5.0.0",
    timestamp: "2025-01-01T00:00:00.000Z",
    scope,
  },
});

// Writing `scope` into the record is task 19.4, so the test sets it here.
const build = (
  run: Run,
  scope: RunScope,
  prev: HistoryRecord | undefined,
  seed = 42,
): HistoryRecord => {
  const r = buildHistoryRecord(verdictOf(run, scope), prev, config, "/proj");
  if (!r.ok) throw new Error(r.error);
  return { ...r.value, seed, scope };
};

const killedOf = (run: Run): Set<string> => new Set(run.filter((r) => r.killed).map((r) => r.id));

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

describe("Property 34: History comparison across scopes", () => {
  it("8.30 selectComparisonRecord returns the latest full record for a full run and the latest record for a spec-only run", () => {
    fc.assert(
      fc.property(fc.array(scopeArb, { maxLength: 10 }), (scopes) => {
        const records: HistoryRecord[] = scopes.map((scope, i) => {
          const base = build([], "full", undefined, i);
          const { scope: _drop, ...rest } = base;
          return scope === undefined ? rest : { ...rest, scope };
        });
        let lastFull: HistoryRecord | undefined;
        for (let i = 0; i < scopes.length; i++) {
          if (scopes[i] !== "spec-only") lastFull = records[i];
        }
        expect(selectComparisonRecord(records, "full")).toBe(lastFull);
        expect(selectComparisonRecord(records, "spec-only")).toBe(records.at(-1));
      }),
    );
  });

  it("8.30 a full run after a spec-only record lists only ids not killed in the last full record", () => {
    fc.assert(
      fc.property(
        fc.array(runArb, { minLength: 1, maxLength: 3 }),
        runArb,
        fc.array(runArb, { minLength: 1, maxLength: 3 }),
        runArb,
        (fullRuns, lastFullRun, specRuns, now) => {
          const records: HistoryRecord[] = [];
          for (const run of [...fullRuns, lastFullRun]) {
            records.push(build(run, "full", records.at(-1), records.length));
          }
          const fullOnly = [...records];
          for (const run of specRuns) {
            records.push(build(run, "spec-only", records.at(-1), records.length));
          }
          const chosen = selectComparisonRecord(records, "full");
          expect(chosen).toBe(fullOnly.at(-1));
          const rec = build(now, "full", chosen);

          const expected = sorted(
            [...killedOf(now)].filter((id) => !killedOf(lastFullRun).has(id)),
          );
          expect(sorted(rec.newlyKilledIds)).toEqual(expected);
          // The spec-only records never influence the result.
          expect(rec.newlyKilledIds).toEqual(build(now, "full", fullOnly.at(-1)).newlyKilledIds);
          for (const id of MECH_IDS) {
            if (killedOf(lastFullRun).has(id)) expect(rec.newlyKilledIds).not.toContain(id);
          }
        },
      ),
    );
  });

  it("8.30 a spec-only run lists only Spec_Mutant ids that the comparison record did not list as killed", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(scopeArb, runArb), { minLength: 1, maxLength: 5 }),
        runArb,
        (history, now) => {
          const records: HistoryRecord[] = [];
          for (const [scope, run] of history) {
            records.push(build(run, scope ?? "full", records.at(-1), records.length));
          }
          const chosen = selectComparisonRecord(records, "spec-only");
          expect(chosen).toBe(records.at(-1));
          const lastRun = (history.at(-1) as [RunScope | undefined, Run])[1];
          const rec = build(now, "spec-only", chosen);

          for (const id of rec.newlyKilledIds) expect(id.startsWith("oath-")).toBe(true);
          const expected = sorted(
            [...killedOf(now)].filter((id) => id.startsWith("oath-") && !killedOf(lastRun).has(id)),
          );
          expect(sorted(rec.newlyKilledIds)).toEqual(expected);
        },
      ),
    );
  });

  it("8.9 two runs of the same scope list the ids killed now and not killed before", () => {
    fc.assert(
      fc.property(
        scopeArb.filter((s) => s !== undefined),
        runArb,
        runArb,
        (scope, before, now) => {
          const s = scope as RunScope;
          const prev = build(before, s, undefined);
          const chosen = selectComparisonRecord([prev], s);
          expect(chosen).toBe(prev);
          const rec = build(now, s, chosen);
          const relevant = (id: string): boolean => s === "full" || id.startsWith("oath-");
          const expected = sorted(
            [...killedOf(now)].filter((id) => relevant(id) && !killedOf(before).has(id)),
          );
          expect(sorted(rec.newlyKilledIds)).toEqual(expected);
        },
      ),
    );
  });
});
