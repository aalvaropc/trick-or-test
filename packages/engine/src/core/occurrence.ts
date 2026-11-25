// Occurrence_Index of Mechanical_Mutants (Requirement 8.7). Pure: no `node:` import.

export type OccurrenceInput = {
  readonly file: string;
  readonly original: string;
  readonly replacement: string;
  /** Start line of the StrykerJS location. */
  readonly line: number;
  /** Start column of the StrykerJS location. */
  readonly column: number;
};

/**
 * Groups mutants by (file, original, replacement), orders each group by start line then start
 * column, and returns each mutant's 0-based position in its group. The result is aligned with
 * the input order.
 */
export function assignOccurrenceIndexes(mutants: readonly OccurrenceInput[]): number[] {
  const groups = new Map<string, number[]>();
  mutants.forEach((m, i) => {
    const key = JSON.stringify([m.file, m.original, m.replacement]);
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  });
  const indexes: number[] = new Array(mutants.length).fill(0);
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const ma = mutants[a] as OccurrenceInput;
      const mb = mutants[b] as OccurrenceInput;
      return ma.line - mb.line || ma.column - mb.column;
    });
    group.forEach((mutantIndex, position) => {
      indexes[mutantIndex] = position;
    });
  }
  return indexes;
}
