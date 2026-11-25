import { describe, expect, it } from "vitest";
import { computeMutantId } from "../../src/core/mutant-id.js";

describe("computeMutantId", () => {
  it("8.7 returns the known hash for a fixed input", () => {
    expect(computeMutantId("src/a.ts", "a + b", "a - b")).toBe("2f64eca79ed74be7af1d0c76699ab6a9");
  });

  it("8.7 is stable across calls", () => {
    expect(computeMutantId("src/a.ts", "a + b", "a - b")).toBe(
      computeMutantId("src/a.ts", "a + b", "a - b"),
    );
  });

  it("8.7 changes when the file differs", () => {
    expect(computeMutantId("src/b.ts", "a + b", "a - b")).not.toBe(
      computeMutantId("src/a.ts", "a + b", "a - b"),
    );
  });

  it("8.7 changes when the original differs", () => {
    expect(computeMutantId("src/a.ts", "a * b", "a - b")).not.toBe(
      computeMutantId("src/a.ts", "a + b", "a - b"),
    );
  });

  it("8.7 changes when the replacement differs", () => {
    expect(computeMutantId("src/a.ts", "a + b", "a * b")).not.toBe(
      computeMutantId("src/a.ts", "a + b", "a - b"),
    );
  });

  it("8.7 hashes empty strings to a 32-character hex id", () => {
    expect(computeMutantId("", "", "")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("8.7 does not collide when characters move between fields", () => {
    expect(computeMutantId("ab", "c", "d")).not.toBe(computeMutantId("a", "bc", "d"));
  });
});
