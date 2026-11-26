// Requirements 8.15, 8.21. Pure: no `node:` import.

type Position = { line: number; column: number };

/** The fields of a mutant that rule 8.15 compares. Ids are never compared. */
export type ReportableMutant = {
  kind: "spec" | "mechanical";
  file: string;
  location: { start: Position; end: Position };
  replacement: string;
};

const changeKey = (m: ReportableMutant): string =>
  JSON.stringify([
    m.file,
    m.location.start.line,
    m.location.start.column,
    m.location.end.line,
    m.location.end.column,
    m.replacement,
  ]);

/**
 * Drops every Twin: a Mechanical_Mutant that makes the same change as a Spec_Mutant, compared by
 * file, start and end location and replacement (8.15). The Spec_Mutant stays. `kept` keeps the
 * input order. A list without Twins comes back unchanged, so the function is idempotent.
 */
export const dropTwins = <T extends ReportableMutant>(
  mutants: readonly T[],
): { kept: T[]; twinsMerged: number } => {
  const specKeys = new Set(mutants.filter((m) => m.kind === "spec").map(changeKey));
  const kept = mutants.filter((m) => m.kind === "spec" || !specKeys.has(changeKey(m)));
  return { kept, twinsMerged: mutants.length - kept.length };
};
