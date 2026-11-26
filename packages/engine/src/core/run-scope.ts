import type { HistoryRecord, MutantId, RunScope } from "./types.js";

/** The Run_Scope of a record. A record without `scope` was written by a full run (8.28). */
export const scopeOf = (record: { scope?: RunScope }): RunScope => record.scope ?? "full";

/** A Spec_Mutant id has the form `oath-<criterion>-<slug>`; a mechanical id is a hash (8.7). */
export const isSpecMutantId = (id: MutantId): boolean => id.startsWith("oath-");

/**
 * Chooses the Comparison_Record for a run (8.30). A `full` run compares with the latest earlier
 * `full` record, a `spec-only` run with the latest earlier record of any scope. Records are in
 * file order, oldest first. Pure.
 */
export const selectComparisonRecord = (
  records: readonly HistoryRecord[],
  scope: RunScope,
): HistoryRecord | undefined => {
  if (scope === "spec-only") return records.at(-1);
  return records.findLast((r) => scopeOf(r) === "full");
};
