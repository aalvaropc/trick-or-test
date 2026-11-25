/**
 * Time limit for one mutated suite run (Requirement 5.15). An explicit `timeoutMs`
 * wins, including 0; otherwise 1.5 times the baseline plus 5 seconds.
 */
export const computeSuiteTimeLimit = (baselineMs: number, timeoutMs?: number): number =>
  timeoutMs !== undefined ? timeoutMs : baselineMs * 1.5 + 5000;
