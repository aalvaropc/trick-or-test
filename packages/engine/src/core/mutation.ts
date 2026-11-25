import { err, ok, type Result } from "./result.js";
import type { MutantId, SpecMutant } from "./types.js";

/** Half-open range [start, end) of the replacement text inside the mutated source. */
export type Span = { start: number; end: number };

export type NotApplicableError = {
  kind: "NotApplicable";
  mutant: MutantId;
  occurrences: number;
};

const countOccurrences = (source: string, needle: string): number => {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + 1;
  }
};

/** Replaces the single occurrence of `mutant.original` with `mutant.mutated` (Requirement 5.2). */
export const applyMutation = (
  source: string,
  mutant: SpecMutant,
): Result<{ mutated: string; span: Span }, NotApplicableError> => {
  const occurrences = countOccurrences(source, mutant.original);
  if (occurrences !== 1) {
    return err({ kind: "NotApplicable", mutant: mutant.id, occurrences });
  }
  const start = source.indexOf(mutant.original);
  const end = start + mutant.mutated.length;
  return ok({
    mutated: source.slice(0, start) + mutant.mutated + source.slice(start + mutant.original.length),
    span: { start, end },
  });
};

/** Restores `mutant.original` at `span` in a previously mutated source. */
export const revertMutation = (mutated: string, mutant: SpecMutant, span: Span): string =>
  mutated.slice(0, span.start) + mutant.original + mutated.slice(span.end);
