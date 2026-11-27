// Requirements 8.22, 8.23. Pure: no `node:` import.
import type { MutantCounts, MutantStatus, RunScope, StatusCounts, StrykerCounts } from "./types.js";

const emptyStatusCounts = (): StatusCounts => ({
  Killed: 0,
  Survived: 0,
  Timeout: 0,
  Ghost: 0,
  InvalidWitness: 0,
  CompileError: 0,
  NotApplicable: 0,
});

/**
 * Counts the kept mutants per kind and per status (8.22). All seven statuses are always present.
 * `mechanical` is omitted for the scope `spec-only`.
 */
export const computeMutantCounts = (
  kept: readonly { kind: "spec" | "mechanical"; status: MutantStatus }[],
  twinsMerged: number,
  scope: RunScope,
): MutantCounts => {
  const spec = emptyStatusCounts();
  const mechanical = emptyStatusCounts();
  for (const m of kept) (m.kind === "spec" ? spec : mechanical)[m.status] += 1;
  return scope === "spec-only" ? { spec, twinsMerged } : { spec, mechanical, twinsMerged };
};

/** Counts every Mechanical_Mutant that StrykerJS produced, before `dropTwins` (8.23). */
export const computeStrykerCounts = (
  produced: readonly { status: MutantStatus }[],
): StrykerCounts => {
  let detected = 0;
  let undetected = 0;
  for (const m of produced) {
    if (m.status === "Killed" || m.status === "Timeout") detected += 1;
    else if (m.status === "Survived") undetected += 1;
  }
  return { detected, undetected, total: produced.length };
};
