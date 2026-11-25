import type { KillClass, Species, Verdict } from "trick-or-test/report";
import { describe, expect, it } from "vitest";
import {
  computeHeadlineCounts,
  computeKillClassCounts,
  computeSpeciesLegend,
  selectStrays,
} from "../../src/bestiary/counts.js";
import type { CreatureState } from "../../src/bestiary/state.js";
import type { Mutant, RunModel } from "../../src/loader/run-model.js";

type Spec = {
  id: string;
  state: CreatureState | "not-counted";
  requirement?: string;
  species?: Species;
  killClass?: KillClass;
  file?: string;
  line?: number;
};

const mutant = (s: Spec): Mutant =>
  ({
    id: s.id,
    file: s.file ?? "a.ts",
    location: { start: { line: s.line ?? 1, column: 1 }, end: { line: s.line ?? 1, column: 2 } },
    mutatorName: "X",
    reportStatus: "Survived",
    statusReason: undefined,
    original: undefined,
    replacement: undefined,
    requirement: s.requirement,
    verdictEntry: s.killClass === undefined ? undefined : { killClass: s.killClass },
    species: s.species ?? "Miscount",
    state: s.state,
  }) as unknown as Mutant;

const coverage = (statuses: string[]) =>
  ({
    coverage: statuses.map((status, i) => ({ criterion: `1.${i}`, status })),
  }) as unknown as Verdict;

const run = (specs: Spec[], verdict?: Verdict): RunModel => ({
  report: {} as RunModel["report"],
  verdict,
  history: [],
  ignoredVerdictEntryCount: 0,
  mutants: specs.map(mutant),
});

describe("counts", () => {
  it("6.1 headline has surviving and killed Spec_Mutants and guarded and unguarded Criteria", () => {
    const model = run(
      [
        { id: "a", state: "survivor", requirement: "1.1" },
        { id: "b", state: "survivor", requirement: "1.2" },
        { id: "c", state: "killed", requirement: "1.1" },
        { id: "d", state: "survivor" },
      ],
      coverage(["guarded", "guarded", "unguarded", "unattacked", "skipped"]),
    );
    expect(computeHeadlineCounts(model)).toEqual({
      survivingSpecMutants: 2,
      killedSpecMutants: 1,
      guardedCriteria: 2,
      unguardedCriteria: 1,
    });
  });

  it("6.14 headline without a verdict has mutant counts and no Criteria counts", () => {
    const model = run([
      { id: "a", state: "survivor", requirement: "1.1" },
      { id: "b", state: "killed", requirement: "1.1" },
    ]);
    const h = computeHeadlineCounts(model);
    expect(h.survivingSpecMutants).toBe(1);
    expect(h.killedSpecMutants).toBe(1);
    expect(h.guardedCriteria).toBeUndefined();
    expect(h.unguardedCriteria).toBeUndefined();
  });

  it("6.8 kill-class groups include 0 for empty groups", () => {
    const model = run([
      { id: "a", state: "killed", killClass: "both" },
      { id: "b", state: "killed", killClass: "both" },
      { id: "c", state: "killed", killClass: "examples-only" },
    ]);
    expect(computeKillClassCounts(model)).toEqual({
      "examples-only": 1,
      "properties-only": 0,
      both: 2,
      unattributed: 0,
    });
    expect(computeKillClassCounts(run([]))).toEqual({
      "examples-only": 0,
      "properties-only": 0,
      both: 0,
      unattributed: 0,
    });
  });

  it("6.15 kill-class sum equals killed Mutants that have a class", () => {
    const model = run([
      { id: "a", state: "killed", killClass: "properties-only" },
      { id: "b", state: "killed", killClass: "unattributed" },
      { id: "c", state: "killed" },
      { id: "d", state: "survivor", killClass: "both" },
    ]);
    const sum = Object.values(computeKillClassCounts(model)).reduce((x, y) => x + y, 0);
    expect(sum).toBe(2);
  });

  it("6.12 legend omits species with 0 Mutants and carries name, body, type and count", () => {
    const model = run([
      { id: "a", state: "survivor", species: "Hollow" },
      { id: "b", state: "killed", species: "Hollow" },
      { id: "c", state: "survivor", species: "Borderling" },
    ]);
    const legend = computeSpeciesLegend(model);
    expect(legend.map((e) => e.species)).toEqual(["Borderling", "Hollow"]);
    expect(legend.map((e) => e.count)).toEqual([1, 2]);
    for (const e of legend) {
      expect(e.bodyDescription.length).toBeGreaterThan(0);
      expect(e.mutationType.length).toBeGreaterThan(0);
    }
  });

  it("6.10 6.11 strays are limited to 60 with the remaining count", () => {
    const specs: Spec[] = Array.from({ length: 61 }, (_, i) => ({
      id: `m${i}`,
      state: "survivor" as const,
      line: i + 1,
    }));
    const sel = selectStrays(run(specs));
    expect(sel.shown).toHaveLength(60);
    expect(sel.remaining).toBe(1);
    expect(selectStrays(run(specs.slice(0, 60))).remaining).toBe(0);
  });

  it("6.11 strays are ordered by status, then file, then line, and Spec_Mutants are excluded", () => {
    const model = run([
      { id: "k", state: "killed", file: "a.ts", line: 1 },
      { id: "s3", state: "survivor", file: "b.ts", line: 1 },
      { id: "s2", state: "survivor", file: "a.ts", line: 9 },
      { id: "s1", state: "survivor", file: "a.ts", line: 2 },
      { id: "spec", state: "survivor", requirement: "1.1" },
    ]);
    expect(selectStrays(model).shown.map((m) => m.id)).toEqual(["s1", "s2", "s3", "k"]);
    expect(model.mutants.map((m) => m.id)).toEqual(["k", "s3", "s2", "s1", "spec"]);
  });

  it("4.11 not-counted Mutants are excluded from every count", () => {
    const model = run(
      [
        { id: "a", state: "not-counted", requirement: "1.1", species: "Hollow", killClass: "both" },
        { id: "b", state: "not-counted", species: "Hollow" },
        { id: "c", state: "survivor", requirement: "1.1" },
      ],
      coverage(["guarded"]),
    );
    expect(computeHeadlineCounts(model).survivingSpecMutants).toBe(1);
    expect(computeHeadlineCounts(model).killedSpecMutants).toBe(0);
    expect(computeSpeciesLegend(model).map((e) => e.species)).toEqual(["Miscount"]);
    expect(Object.values(computeKillClassCounts(model))).toEqual([0, 0, 0, 0]);
    expect(selectStrays(model)).toEqual({ shown: [], remaining: 0 });
  });
});
