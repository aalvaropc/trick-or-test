import { COLUMNS, type ColumnId, type PlainRow } from "./columns.js";

export type SortDirection = "ascending" | "descending";

const byId = (a: PlainRow, b: PlainRow): number =>
  a.mutantId < b.mutantId ? -1 : a.mutantId > b.mutantId ? 1 : 0;

/**
 * Sorts rows by a column. Ties break by mutant id ascending in both
 * directions. Returns a new array. Pure.
 */
export const sortRows = (
  rows: readonly PlainRow[],
  column: ColumnId,
  direction: SortDirection,
): PlainRow[] => {
  const def = COLUMNS.find((c) => c.id === column);
  const sign = direction === "ascending" ? 1 : -1;
  const compare = def?.compare;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const primary = compare ? sign * compare(x.row, y.row) : 0;
      return primary || byId(x.row, y.row) || x.index - y.index;
    })
    .map((entry) => entry.row);
};
