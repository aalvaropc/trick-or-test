// Property 27: Claim parsing, end of an id list. Validates: Requirements 11.3
import * as fc from "fast-check";
import { describe, it } from "vitest";
import { type ClaimRef, parseClaimComments } from "../../src/core/claims.js";

const number = fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 99 }));

const ref: fc.Arbitrary<{ text: string; ref: ClaimRef }> = fc.oneof(
  number.map((n) => ({ text: String(n), ref: { kind: "requirement", number: n } as ClaimRef })),
  fc.tuple(number, number).map(([a, b]) => ({
    text: `${a}.${b}`,
    ref: { kind: "criterion", id: `${a}.${b}` } as ClaimRef,
  })),
);

const tail = fc
  .array(fc.constantFrom(".", ";", ":", ")", "]"), { maxLength: 4 })
  .map((marks) => marks.join(""));

const malformed = fc.constantFrom("7.4.1", "7.4x", "x", "1.2.3", "abc");

describe("claim id list end", () => {
  it("11.3 ids are read in order whatever marks follow the last id", () => {
    fc.assert(
      fc.property(fc.array(ref, { minLength: 1, maxLength: 6 }), tail, (items, marks) => {
        // Marks follow only an N.M id; a whole requirement followed by a mark ends the list.
        const last = items[items.length - 1];
        const suffix = last?.ref.kind === "criterion" ? marks : "";
        const line = `Validates: Requirements ${items.map((i) => i.text).join(", ")}${suffix}`;
        const got = parseClaimComments([line], "s");
        if (JSON.stringify(got) !== JSON.stringify(items.map((i) => i.ref))) {
          throw new Error(`${line} gave ${JSON.stringify(got)}`);
        }
      }),
    );
  });

  it("11.3 a malformed token after the ids ends the list", () => {
    fc.assert(
      fc.property(
        fc.array(ref, { minLength: 1, maxLength: 5 }),
        malformed,
        ref,
        (items, bad, after) => {
          const line = `Validates: Requirements ${items.map((i) => i.text).join(", ")}, ${bad}, ${after.text}`;
          const got = parseClaimComments([line], "s");
          if (JSON.stringify(got) !== JSON.stringify(items.map((i) => i.ref))) {
            throw new Error(`${line} gave ${JSON.stringify(got)}`);
          }
        },
      ),
    );
  });
});
