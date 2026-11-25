import { describe, expect, it } from "vitest";
import { buildVerdict, type VerdictInput } from "../../src/core/report.js";
import type { CriterionId, MutantId, MutantResult, TestId } from "../../src/core/types.js";
import type { WitnessOutcome } from "../../src/core/witness-compare.js";

const mid = (s: string) => s as MutantId;
const cid = (s: string) => s as CriterionId;
const tid = (s: string) => s as TestId;

const input = (mutants: MutantResult[]): VerdictInput => ({
  coverage: [{ criterion: cid("5.6"), status: "unattacked" }],
  mutants,
  witnesses: {},
  ignoreStaticRetried: false,
  projectRoot: "/proj",
  metadata: {
    gitCommit: "abc123",
    seed: 42,
    engineVersion: "0.1.0",
    nodeVersion: "22.0.0",
    strykerVersion: "9.0.0",
    vitestVersion: "3.0.0",
    typescriptVersion: "5.6.0",
    timestamp: "2025-01-01T00:00:00.000Z",
  },
});

const invalid = (originalOutcome: WitnessOutcome): MutantResult => ({
  id: mid("oath-5.6-x"),
  species: "Oathbreaker",
  status: "InvalidWitness",
  requirement: cid("5.6"),
  killingTests: [],
  invalidWitness: { expected: { expected: 7 }, originalOutcome },
});

describe("buildVerdict, InvalidWitness mutants", () => {
  it("5.6 an InvalidWitness mutant carries the expectation and the original outcome", () => {
    const r = buildVerdict(input([invalid({ kind: "value", value: 8 })]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mutants[0]?.invalidWitness).toEqual({
      expected: { expected: 7 },
      originalOutcome: { kind: "value", value: 8 },
    });
  });

  it("5.6 an expected error class and an error outcome validate", () => {
    const m: MutantResult = {
      ...invalid({ kind: "error", className: "TypeError" }),
      invalidWitness: {
        expected: { expectedError: "RangeError" },
        originalOutcome: { kind: "error", className: "TypeError" },
      },
    };
    const r = buildVerdict(input([m]));
    expect(r.ok && r.value.mutants[0]?.invalidWitness).toEqual(m.invalidWitness);
  });

  it("5.6 an originalOutcome of kind timeout validates", () => {
    const r = buildVerdict(input([invalid({ kind: "timeout", message: "exceeded 10000 ms" })]));
    expect(r.ok && r.value.mutants[0]?.invalidWitness?.originalOutcome).toEqual({
      kind: "timeout",
      message: "exceeded 10000 ms",
    });
  });

  it("5.6 an originalOutcome of kind no-outcome validates", () => {
    const r = buildVerdict(input([invalid({ kind: "no-outcome", message: "file missing" })]));
    expect(r.ok && r.value.mutants[0]?.invalidWitness?.originalOutcome).toEqual({
      kind: "no-outcome",
      message: "file missing",
    });
  });

  it("5.6 an originalOutcome of an unknown kind is rejected", () => {
    const m = invalid({ kind: "value", value: 1 });
    const bad = {
      ...m,
      invalidWitness: { ...m.invalidWitness, originalOutcome: { kind: "other" } },
    } as unknown as MutantResult;
    const r = buildVerdict(input([bad]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("invalidWitness");
  });

  it("8.5 a Killed mutant has no invalidWitness", () => {
    const killed: MutantResult = {
      id: mid("oath-1.1"),
      species: "Oathbreaker",
      status: "Killed",
      requirement: cid("1.1"),
      killingTests: [tid("a")],
      killClass: "both",
      invalidWitness: { expected: { expected: 1 }, originalOutcome: { kind: "value", value: 2 } },
    };
    const r = buildVerdict(input([killed]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mutants[0]).not.toHaveProperty("invalidWitness");
  });
});
