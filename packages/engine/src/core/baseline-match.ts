/**
 * Matching a StrykerJS killing test to a Baseline_Test (Requirements 6.13 to 6.15).
 * Pure: no file system, no `node:` import.
 */
import { toTestId } from "./baseline-tests.js";
import type { TestId } from "./types.js";

export type BaselineTestSource = {
  file: string;
  /** Vitest's `ancestorTitles` followed by `title`. */
  titles: readonly string[];
  startLine: number;
};

export type KillerRef = { file: string; name: string; startLine?: number };

type Entry = { id: TestId; startLine: number };

/** Entries by file, then by the spelling of the titles. */
export type BaselineTestIndex = ReadonlyMap<string, ReadonlyMap<string, readonly Entry[]>>;

/**
 * The separator StrykerJS puts between the titles of a test name: a space up to Vitest 4,
 * ' > ' from Vitest 5. An unreadable version gives ' > ' (6.16).
 */
export const strykerSeparatorFor = (vitestVersion: string | undefined): " > " | " " => {
  const major = /^\d+/.exec(vitestVersion ?? "")?.[0];
  return major !== undefined && Number(major) <= 4 ? " " : " > ";
};

export const indexBaselineTests = (
  sources: readonly BaselineTestSource[],
  separator: " > " | " " = " > ",
): BaselineTestIndex => {
  const index = new Map<string, Map<string, Entry[]>>();
  for (const source of sources) {
    const byName = index.get(source.file) ?? new Map<string, Entry[]>();
    index.set(source.file, byName);
    const name = source.titles.join(separator);
    const entries = byName.get(name) ?? [];
    byName.set(name, entries);
    entries.push({
      id: toTestId(source.file, source.titles.join(" ")),
      startLine: source.startLine,
    });
  }
  return index;
};

const distinctIds = (entries: readonly Entry[]): TestId[] => [
  ...new Set(entries.map((entry) => entry.id)),
];

export const matchBaselineTest = (index: BaselineTestIndex, killer: KillerRef): TestId | "none" => {
  const candidates = index.get(killer.file)?.get(killer.name) ?? [];
  const ids = distinctIds(candidates);
  if (ids.length === 0) return "none";
  if (ids.length === 1) return ids[0] as TestId;
  if (killer.startLine === undefined) return "none";
  const atLine = distinctIds(candidates.filter((entry) => entry.startLine === killer.startLine));
  return atLine.length === 1 ? (atLine[0] as TestId) : "none";
};
