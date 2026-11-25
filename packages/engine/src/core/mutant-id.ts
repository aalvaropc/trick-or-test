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
