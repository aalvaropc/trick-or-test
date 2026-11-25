// Property 16: Verdict round trip. Validates: Requirements 5.6, 8.5, 8.10, 8.12
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { serializeVerdict, verdictSchema } from "../../src/core/report.js";
import type { InvalidWitnessRecord, MutantId, MutantResult } from "../../src/core/types.js";
import { verdictArb } from "../helpers/verdict-generator.js";

const expectationArb = fc.oneof(
  fc.record({ expected: fc.jsonValue() }),
  fc.record({ expectedError: fc.string({ maxLength: 12 }) }),
);

const originalOutcomeArb = fc.oneof(
  fc.record({ kind: fc.constant("value"), value: fc.jsonValue() }),
  fc.record({ kind: fc.constant("error"), className: fc.string({ maxLength: 12 }) }),
  fc.record({ kind: fc.constant("timeout"), message: fc.string({ maxLength: 12 }) }),
  fc.record({ kind: fc.constant("no-outcome"), message: fc.string({ maxLength: 12 }) }),
);

const invalidMutantArb = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 10 }),
    invalidWitness: fc.record({
      expected: expectationArb,
      originalOutcome: originalOutcomeArb,
    }),
  })
  .map(
    ({ id, invalidWitness }): MutantResult => ({
      id: id as MutantId,
      species: "Oathbreaker",
      status: "InvalidWitness",
      killingTests: [],
      invalidWitness: invalidWitness as unknown as InvalidWitnessRecord,
    }),
  );

const verdictWithInvalidArb = fc
  .tuple(verdictArb, fc.array(invalidMutantArb, { minLength: 1, maxLength: 3 }))
  .map(([verdict, invalid]) => ({
    ...verdict,
    mutants: [
      ...verdict.mutants.map(({ invalidWitness: _dropped, ...rest }) => rest as MutantResult),
      ...invalid,
    ],
  }));

describe("Property 16: Verdict round trip", () => {
  it("8.12 serialize, parse, validate and serialize again gives identical text", () => {
    fc.assert(
      fc.property(verdictArb, (verdict) => {
        const first = serializeVerdict(verdict);
        const parsed = verdictSchema.parse(JSON.parse(first));
        expect(serializeVerdict(parsed)).toBe(first);
      }),
    );
  });

  it("5.6 8.5 8.10 8.12 InvalidWitness mutants with every outcome kind round trip to identical text", () => {
    fc.assert(
      fc.property(verdictWithInvalidArb, (verdict) => {
        const first = serializeVerdict(verdict);
        const parsed = verdictSchema.parse(JSON.parse(first));
        expect(serializeVerdict(parsed)).toBe(first);
        expect(parsed.mutants.some((m) => m.invalidWitness !== undefined)).toBe(true);
      }),
    );
  });
});
