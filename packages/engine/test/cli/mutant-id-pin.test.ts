import { describe, expect, it } from "vitest";
import { computeMutantId } from "../../src/core/mutant-id.js";

describe("computeMutantId pinned values", () => {
  it("8.7 a change to the hash input or the hash function must change this pinned id on purpose (index 0)", () => {
    expect(computeMutantId("src/price.ts", "a < b", "a <= b", 0)).toBe(
      "aef1a450312ccc9949bb67e133921e74",
    );
  });

  it("8.7 a change to the hash input or the hash function must change this pinned id on purpose (index 1)", () => {
    expect(computeMutantId("src/price.ts", "a < b", "a <= b", 1)).toBe(
      "d36d1a4756dcd55205151520a3135bd7",
    );
  });
});
