import { describe, expect, it } from "vitest";
import { assignOccurrenceIndexes, computeMutantId } from "../../src/core/mutant-id.js";

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

describe("assignOccurrenceIndexes", () => {
  const at = (line: number, column: number, replacement = "a - b") => ({
    file: "src/a.ts",
    original: "a + b",
    replacement,
    line,
    column,
  });
  const idsFor = (list: ReturnType<typeof at>[]) =>
    assignOccurrenceIndexes(list).map((i) => computeMutantId("src/a.ts", "a + b", "a - b", i));

  it("8.7 two identical changes on different lines get different ids", () => {
    const [a, b] = idsFor([at(3, 1), at(9, 1)]);
    expect(a).not.toBe(b);
  });

  it("8.13 the same change keeps its id when unrelated lines above it move", () => {
    expect(idsFor([at(13, 1), at(19, 1)])).toEqual(idsFor([at(3, 1), at(9, 1)]));
  });

  it("4.5 numbers a group of three by line then column from unordered input", () => {
    const indexes = assignOccurrenceIndexes([at(9, 1), at(2, 7), at(2, 3), at(5, 1, "a * b")]);
    expect(indexes).toEqual([2, 1, 0, 0]);
  });
});
