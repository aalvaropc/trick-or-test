import { describe, expect, it } from "vitest";
import { buildVerdict, type VerdictInput } from "../../src/core/report.js";
import type { MutantId, VerdictWitness } from "../../src/core/types.js";
import type { WitnessOutcome } from "../../src/core/witness-compare.js";

const mid = "oath-4.1-x" as MutantId;

const input = (witness: VerdictWitness): VerdictInput => ({
  coverage: [],
  mutants: [],
  witnesses: { [mid]: witness } as VerdictInput["witnesses"],
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

const build = (witness: VerdictWitness): VerdictWitness => {
  const r = buildVerdict(input(witness));
  if (!r.ok) throw new Error(r.error);
  return r.value.witnesses[mid] as VerdictWitness;
};

const base = { from: "src/price.ts", export: "price", args: [1] };
const outcomeOf = (o: WitnessOutcome): WitnessOutcome | undefined =>
  build({ ...base, expected: 1, mutatedOutcome: o }).mutatedOutcome;

describe("buildVerdict, mutated witness outcome", () => {
  it("8.19 a value outcome is kept", () => {
    expect(outcomeOf({ kind: "value", value: { a: [2] } })).toEqual({
      kind: "value",
      value: { a: [2] },
    });
  });

  it("8.19 an error outcome is kept", () => {
    expect(outcomeOf({ kind: "error", className: "RangeError" })).toEqual({
      kind: "error",
      className: "RangeError",
    });
  });

  it("8.19 a timeout outcome is kept", () => {
    expect(outcomeOf({ kind: "timeout", message: "took too long" })).toEqual({
      kind: "timeout",
      message: "took too long",
    });
  });

  it("8.19 a no-outcome outcome is kept", () => {
    expect(outcomeOf({ kind: "no-outcome", message: "no result" })).toEqual({
      kind: "no-outcome",
      message: "no result",
    });
  });

  it("8.17 an absolute path in a no-outcome message is scrubbed", () => {
    expect(outcomeOf({ kind: "no-outcome", message: "cannot import /proj/src/a.ts" })).toEqual({
      kind: "no-outcome",
      message: "cannot import src/a.ts",
    });
  });

  it("8.17 an absolute path in a timeout message is scrubbed", () => {
    expect(outcomeOf({ kind: "timeout", message: "stuck in /proj/src/a.ts" })).toEqual({
      kind: "timeout",
      message: "stuck in src/a.ts",
    });
  });

  it("8.17 an absolute path in an error class name is scrubbed", () => {
    expect(outcomeOf({ kind: "error", className: "/other/dir/Boom" })).toEqual({
      kind: "error",
      className: "<outside-project>/Boom",
    });
  });

  it("8.19 a witness with expectedError keeps the field", () => {
    const w = build({
      ...base,
      expectedError: "RangeError",
      mutatedOutcome: { kind: "value", value: 3 },
    });
    expect(w.mutatedOutcome).toEqual({ kind: "value", value: 3 });
    expect("expectedError" in w && w.expectedError).toBe("RangeError");
  });

  it("8.19 a witness with expected keeps the field", () => {
    const w = build({ ...base, expected: 1, mutatedOutcome: { kind: "value", value: 3 } });
    expect(w.mutatedOutcome).toEqual({ kind: "value", value: 3 });
    expect("expected" in w && w.expected).toBe(1);
  });

  it("8.20 an entry without the field has no mutatedOutcome key", () => {
    const w = build({ ...base, expected: 1 });
    expect(Object.hasOwn(w, "mutatedOutcome")).toBe(false);
  });
});
