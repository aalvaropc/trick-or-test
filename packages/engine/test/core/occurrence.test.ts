import { describe, expect, it } from "vitest";
import { computeMutantId } from "../../src/core/mutant-id.js";
import { assignOccurrenceIndexes } from "../../src/core/occurrence.js";

const at = (line: number, column: number, replacement = "a - b", file = "src/a.ts") => ({
  file,
  original: "a + b",
  replacement,
  line,
  column,
});

const idsFor = (list: ReturnType<typeof at>[]) =>
  assignOccurrenceIndexes(list).map((i) => computeMutantId("src/a.ts", "a + b", "a - b", i));

describe("assignOccurrenceIndexes", () => {
  it("8.7 numbers a group of three by location from shuffled input", () => {
    expect(assignOccurrenceIndexes([at(9, 1), at(2, 3), at(5, 1)])).toEqual([2, 0, 1]);
  });

  it("8.7 numbers each (file, original, replacement) group on its own", () => {
    const indexes = assignOccurrenceIndexes([
      at(9, 1),
      at(2, 1, "a * b"),
      at(2, 1),
      at(4, 1, "a * b", "src/b.ts"),
    ]);
    expect(indexes).toEqual([1, 0, 0, 0]);
  });

  it("8.7 orders two mutants on the same line by column", () => {
    expect(assignOccurrenceIndexes([at(4, 12), at(4, 3)])).toEqual([1, 0]);
  });

  it("3.16 two identical changes on different lines get different ids", () => {
    const [a, b] = idsFor([at(3, 1), at(9, 1)]);
    expect(a).not.toBe(b);
  });

  it("3.16 a mutant keeps its id when unrelated lines above it move", () => {
    expect(idsFor([at(13, 1), at(19, 1)])).toEqual(idsFor([at(3, 1), at(9, 1)]));
  });
});
