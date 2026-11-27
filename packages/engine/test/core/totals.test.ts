import { describe, expect, it } from "vitest";
import { computeMutantCounts, computeStrykerCounts } from "../../src/core/totals.js";
import type { MutantStatus } from "../../src/core/types.js";

const ALL: MutantStatus[] = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
];

describe("computeStrykerCounts", () => {
  it("8.23 one mutant of each status gives detected 2, undetected 1, total 7", () => {
    expect(computeStrykerCounts(ALL.map((status) => ({ status })))).toEqual({
      detected: 2,
      undetected: 1,
      total: 7,
    });
  });

  it("8.23 an empty list gives zeros", () => {
    expect(computeStrykerCounts([])).toEqual({ detected: 0, undetected: 0, total: 0 });
  });
});

describe("computeMutantCounts", () => {
  const kept = [
    { kind: "spec", status: "Killed" },
    { kind: "mechanical", status: "Survived" },
    { kind: "mechanical", status: "Survived" },
  ] as const;

  it("8.22 has all seven status keys for each kind, zero when none", () => {
    const counts = computeMutantCounts(kept, 3, "full");
    expect(Object.keys(counts.spec).sort()).toEqual([...ALL].sort());
    expect(Object.keys(counts.mechanical ?? {}).sort()).toEqual([...ALL].sort());
    expect(counts.spec.Killed).toBe(1);
    expect(counts.spec.Survived).toBe(0);
    expect(counts.mechanical?.Survived).toBe(2);
    expect(counts.twinsMerged).toBe(3);
  });

  it("8.22 has no mechanical key for the scope spec-only", () => {
    const counts = computeMutantCounts([{ kind: "spec", status: "Ghost" }], 0, "spec-only");
    expect("mechanical" in counts).toBe(false);
    expect(counts.spec.Ghost).toBe(1);
  });
});
