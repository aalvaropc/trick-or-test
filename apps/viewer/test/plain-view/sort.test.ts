import { describe, expect, it } from "vitest";
import type { PlainRow } from "../../src/plain-view/columns.js";
import { sortRows } from "../../src/plain-view/sort.js";

const row = (mutantId: string, line: number, file = "src/a.ts"): PlainRow => ({
  mutantId,
  species: "Borderling",
  stateLabel: "survived",
  status: "Survived",
  requirement: undefined,
  file,
  line,
  killClass: undefined,
});

const ids = (rows: readonly PlainRow[]): string[] => rows.map((r) => r.mutantId);

describe("sortRows", () => {
  it("9.3 sorts ascending by the chosen column", () => {
    const rows = [row("c", 30), row("a", 10), row("b", 20)];
    expect(ids(sortRows(rows, "line", "ascending"))).toEqual(["a", "b", "c"]);
    const byId = [row("b", 1), row("c", 2), row("a", 3)];
    expect(ids(sortRows(byId, "id", "ascending"))).toEqual(["a", "b", "c"]);
  });

  it("9.3 sorts numbers numerically, not as text", () => {
    const rows = [row("a", 100), row("b", 9), row("c", 20)];
    expect(ids(sortRows(rows, "line", "ascending"))).toEqual(["b", "c", "a"]);
  });

  it("9.3 returns a new array and leaves the input untouched", () => {
    const rows = [row("b", 2), row("a", 1)];
    const sorted = sortRows(rows, "line", "ascending");
    expect(sorted).not.toBe(rows);
    expect(ids(rows)).toEqual(["b", "a"]);
  });

  it("9.4 descending reverses the order of the ascending sort on distinct values", () => {
    const rows = [row("c", 30), row("a", 10), row("b", 20)];
    expect(ids(sortRows(rows, "line", "descending"))).toEqual(["c", "b", "a"]);
  });

  it("9.5 ties break by mutant id ascending when the column is ascending", () => {
    const rows = [row("d", 5), row("b", 5), row("c", 1), row("a", 5)];
    expect(ids(sortRows(rows, "line", "ascending"))).toEqual(["c", "a", "b", "d"]);
  });

  it("9.5 ties break by mutant id ascending when the column is descending", () => {
    const rows = [row("d", 5), row("b", 5), row("c", 1), row("a", 5)];
    expect(ids(sortRows(rows, "line", "descending"))).toEqual(["a", "b", "d", "c"]);
  });

  it("9.5 sorting by id descending has no ties and reverses fully", () => {
    const rows = [row("a", 1), row("c", 1), row("b", 1)];
    expect(ids(sortRows(rows, "id", "descending"))).toEqual(["c", "b", "a"]);
  });
});
