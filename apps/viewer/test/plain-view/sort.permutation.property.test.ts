// Feature: bestiary-viewer, Property V10: Sorting is a permutation

import * as fc from "fast-check";
import {
  type CriterionId,
  killClassSchema,
  reportStatusSchema,
  speciesSchema,
} from "trick-or-test/report";
import { describe, expect, it } from "vitest";
import { COLUMNS, type PlainRow } from "../../src/plain-view/columns.js";
import { sortRows } from "../../src/plain-view/sort.js";

const rowArb: fc.Arbitrary<PlainRow> = fc.record({
  // A small pool makes ties and duplicate ids likely.
  mutantId: fc.constantFrom("a", "b", "c", "d", "e", "f", "g", "h"),
  species: fc.constantFrom(...speciesSchema.options),
  stateLabel: fc.constantFrom("survived", "killed by t1", "ghost, not counted", "not counted"),
  status: fc.constantFrom(...reportStatusSchema.options),
  requirement: fc.option(fc.constantFrom("1.1", "4.3", "9.12") as fc.Arbitrary<CriterionId>, {
    nil: undefined,
  }),
  file: fc.constantFrom("src/a.ts", "src/b.ts"),
  line: fc.constantFrom(1, 2, 9, 10, 100),
  killClass: fc.option(fc.constantFrom(...killClassSchema.options), { nil: undefined }),
});

describe("sortRows permutation properties", () => {
  it("9.12 9.13 sorting keeps the same rows and sorting again keeps the same order", () => {
    fc.assert(
      fc.property(
        fc.array(rowArb, { maxLength: 30 }),
        fc.constantFrom(...COLUMNS.map((c) => c.id)),
        fc.constantFrom("ascending" as const, "descending" as const),
        (rows, column, direction) => {
          const once = sortRows(rows, column, direction);
          const key = (r: PlainRow): string => JSON.stringify(r);
          expect(once.map(key).sort()).toEqual(rows.map(key).sort());
          expect(once.map((r) => r.mutantId).sort()).toEqual(rows.map((r) => r.mutantId).sort());
          expect(sortRows(once, column, direction)).toEqual(once);
        },
      ),
    );
  });
});
