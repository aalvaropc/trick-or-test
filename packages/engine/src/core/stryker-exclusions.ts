/**
 * StrykerJS sandbox exclusions (Requirements 3.7, 3.8). Pure string work: no `node:` imports.
 * Paths use `/` separators and are project-relative.
 */
import type { ProjectEntry } from "./sandbox-plan.js";

export type StrykerExclusions = {
  readonly nonBuildDirs: string[];
  readonly symlinkedDirs: string[];
  readonly ignorePatterns: string[];
};

const ALWAYS_IGNORED = [".stryker-tmp", ".trickortest"];

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort(compare);

/** Strips leading `./` and surrounding slashes; an empty result means "no directory". */
const cleanDir = (p: string): string =>
  p
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");

/**
 * Computes the directories StrykerJS leaves out of its sandbox.
 *
 * `outputDirRelative` is an addition to the design signature: the output directory is part of the
 * config, not of the listing, so the shell passes it in, as it does for `planSandboxCopy`.
 */
export const computeStrykerExclusions = (
  listing: readonly ProjectEntry[],
  buildRoots: readonly string[],
  outputDirRelative?: string,
): StrykerExclusions => {
  const roots = new Set(buildRoots);
  const dirPaths = new Set(listing.filter((e) => e.kind === "dir").map((e) => e.path));

  const nonBuildDirs = sortedUnique(
    listing
      .filter((e) => e.kind === "dir" && !e.path.includes("/") && !roots.has(e.path))
      .map((e) => e.path),
  );

  const symlinkedDirs = sortedUnique(
    listing
      .filter((e) => {
        if (e.kind !== "symlink" || e.target === undefined) {
          return false;
        }
        const target = cleanDir(e.target);
        return target === "" || dirPaths.has(target);
      })
      .map((e) => e.path),
  );

  const outputDir = outputDirRelative === undefined ? "" : cleanDir(outputDirRelative);
  const ignorePatterns = sortedUnique(
    [
      ...nonBuildDirs,
      ...symlinkedDirs,
      ...ALWAYS_IGNORED,
      ...(outputDir === "" ? [] : [outputDir]),
    ].map((d) => `${d}/**`),
  );

  return { nonBuildDirs, symlinkedDirs, ignorePatterns };
};
