/**
 * Test files that the Baseline_Run ran and StrykerJS did not (Requirements 3.23, 3.24).
 * Pure: no `node:` imports. Both inputs are project-relative paths.
 */
export const findUnrunTestFiles = (
  baselineTestFiles: readonly string[],
  strykerTestFiles: readonly string[],
): { count: number; paths: string[] } => {
  const ran = new Set(strykerTestFiles);
  const paths = [...new Set(baselineTestFiles)]
    .filter((path) => !ran.has(path))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { count: paths.length, paths };
};
