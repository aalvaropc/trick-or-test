// Content-hash id for Mechanical_Mutants (Requirement 8.7). Not used for Spec_Mutants.
// The only core module that imports from `node:` (ADR 0005); createHash is a pure function of its input.
import { createHash } from "node:crypto";
import type { MutantId } from "./types.js";

const ID_HEX_LENGTH = 32;

/**
 * Deterministic id from file, original text, replacement and Occurrence_Index.
 * Fields are length-prefixed so different splits of the same characters never collide.
 * No timestamp and no line number: unrelated edits above a change do not alter its id.
 */
export function computeMutantId(
  file: string,
  original: string,
  replacement: string,
  occurrenceIndex: number,
): MutantId {
  const input = [file, original, replacement, String(occurrenceIndex)]
    .map((field) => `${field.length}:${field}`)
    .join("\n");
  return createHash("sha256")
    .update(input, "utf8")
    .digest("hex")
    .slice(0, ID_HEX_LENGTH) as MutantId;
}

export type OccurrenceInput = {
  readonly file: string;
  readonly original: string;
  readonly replacement: string;
  readonly line: number;
  readonly column: number;
};

/**
 * Groups mutants by (file, original, replacement), orders each group by line then column,
 * and returns each mutant's 0-based position in its group. The result is aligned with the input order.
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
