import { expandBraces, globToRegExp } from "./test-classification.js";

/** A `file:start-end` line range (1-based, inclusive) with a project-relative path. */
export interface ChangedRange {
  readonly file: string;
  readonly start: number;
  readonly end: number;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

const unquotePath = (raw: string): string => {
  if (!raw.startsWith('"')) return raw;
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw;
  }
};

const normalizeGlob = (glob: string): string => glob.replace(/\\/g, "/").replace(/^\.\//, "");

const isInsideProject = (file: string): boolean =>
  file !== "" &&
  !file.startsWith("/") &&
  !/^[A-Za-z]:/.test(file) &&
  !file.split("/").includes("..");

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Parses the output of `git diff --relative --unified=0` (paths already
 * relative to the Target_Project) into the added or changed line ranges of
 * the files that match the source globs. A hunk with no added lines (a pure
 * deletion) yields no range, as do deleted files and paths outside the
 * project. The result is sorted by file and then by start line.
 */
export const parseChangedRanges = (diffText: string, sourceGlobs: string[]): ChangedRange[] => {
  const matchers = sourceGlobs.flatMap((glob) =>
    expandBraces(normalizeGlob(glob)).map(globToRegExp),
  );
  const matches = (file: string): boolean => matchers.some((re) => re.test(file));

  const ranges: ChangedRange[] = [];
  let file: string | undefined;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("diff --git ")) {
      file = undefined;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const target = unquotePath(line.slice(4).replace(/\r$/, ""));
      const path = target === "/dev/null" ? undefined : target.replace(/^b\//, "");
      file = path !== undefined && isInsideProject(path) && matches(path) ? path : undefined;
      continue;
    }
    const match = HUNK_HEADER.exec(line);
    if (match === null || file === undefined) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count === 0) continue;
    ranges.push({ file, start, end: start + count - 1 });
  }
  return ranges.sort((a, b) => compare(a.file, b.file) || a.start - b.start);
};
