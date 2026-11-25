// Property 14: History is append-only. Validates: Requirements 8.8, 8.9
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { appendHistory, buildHistoryRecord } from "../../src/core/report.js";
import type {
  CriterionId,
  EngineConfig,
  HistoryRecord,
  MutantId,
  MutantResult,
  MutantStatus,
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

const STATUSES: MutantStatus[] = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
];

const IDS = ["a", "b", "c", "d", "e", "f", "g", "h"];

// A run: each id independently absent or present with some status.
const runArb = fc
  .array(fc.option(fc.constantFrom(...STATUSES), { nil: undefined }), {
    minLength: IDS.length,
    maxLength: IDS.length,
  })
  .map((sts) => {
    const out: MutantResult[] = [];
    sts.forEach((s, i) => {
      if (s !== undefined) {
        out.push({
          id: IDS[i] as MutantId,
          species: "Oathbreaker",
          status: s,
          killingTests: [],
        });
      }
    });
    return out;
  });

const verdictOf = (mutants: MutantResult[], n: number): Verdict => ({
  coverage: [{ criterion: "1.1" as CriterionId, status: "guarded" }],
  mutants,
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
    timestamp: new Date(1_700_000_000_000 + n * 1000).toISOString(),
  },
});

const killedIds = (mutants: readonly MutantResult[]): Set<string> =>
  new Set(mutants.filter((m) => m.status === "Killed").map((m) => m.id as string));

describe("Property 14: History is append-only", () => {
  it("appending never changes earlier records, and newlyKilledIds is killed minus previously killed", () => {
    fc.assert(
      fc.property(fc.array(runArb, { minLength: 1, maxLength: 8 }), (runs) => {
        let history: readonly HistoryRecord[] = [];
        let prev: HistoryRecord | undefined;
        let prevRun: MutantResult[] = [];
        runs.forEach((run, n) => {
          const built = buildHistoryRecord(verdictOf(run, n), prev, config, "/proj");
          expect(built.ok).toBe(true);
          if (!built.ok) return;
          const rec = built.value;

          const snapshot = structuredClone(history);
          const next = appendHistory(history, rec);
          // earlier records unchanged, input not mutated, new record last
          expect(history).toEqual(snapshot);
          expect(next.length).toBe(history.length + 1);
          expect(next.slice(0, -1)).toEqual(snapshot);
          expect(next[next.length - 1]).toEqual(rec);

          const before = killedIds(prevRun);
          const expected = [...killedIds(run)].filter((id) => !before.has(id));
          expect([...rec.newlyKilledIds].sort()).toEqual(expected.sort());

          history = next;
          prev = rec;
          prevRun = run;
        });
      }),
    );
  });
});
