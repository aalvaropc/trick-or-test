import { describe, expect, it } from "vitest";
import { computeMutantId } from "../../src/core/mutant-id.js";

describe("computeMutantId", () => {
  it("8.7 returns a stable 32-character hex id for a fixed input", () => {
    expect(computeMutantId("src/a.ts", "a + b", "a - b", 0)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("8.7 is stable across calls", () => {
    expect(computeMutantId("src/a.ts", "a + b", "a - b", 0)).toBe(
      computeMutantId("src/a.ts", "a + b", "a - b", 0),
    );
  });

  it("8.7 changes when the file differs", () => {
    expect(computeMutantId("src/b.ts", "a + b", "a - b", 0)).not.toBe(
      computeMutantId("src/a.ts", "a + b", "a - b", 0),
    );
  });

  it("8.7 changes when the original differs", () => {
    expect(computeMutantId("src/a.ts", "a * b", "a - b", 0)).not.toBe(
      computeMutantId("src/a.ts", "a + b", "a - b", 0),
    );
  });

  it("8.7 changes when the replacement differs", () => {
    expect(computeMutantId("src/a.ts", "a + b", "a * b", 0)).not.toBe(
      computeMutantId("src/a.ts", "a + b", "a - b", 0),
    );
  });

  it("8.7 hashes empty strings to a 32-character hex id", () => {
    expect(computeMutantId("", "", "", 0)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("8.7 does not collide when characters move between fields", () => {
    expect(computeMutantId("ab", "c", "d", 0)).not.toBe(computeMutantId("a", "bc", "d", 0));
  });

  it("8.7 index 0 and index 1 give different ids", () => {
    expect(computeMutantId("src/a.ts", "a + b", "a - b", 0)).not.toBe(
      computeMutantId("src/a.ts", "a + b", "a - b", 1),
    );
  });
});
