// Property 16: Verdict round trip. Validates: Requirements 8.5, 8.10, 8.12
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { serializeVerdict, verdictSchema } from "../../src/core/report.js";
import { verdictArb } from "../helpers/verdict-generator.js";

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
});
