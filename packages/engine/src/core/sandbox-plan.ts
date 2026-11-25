/**
 * Sandbox path rules (Requirements 5.17-5.19). Pure string work: no `node:` imports.
 * Paths use `/` separators.
 */
import { err, ok, type Result } from "./result.js";

/** One entry of a project listing. `target` is set for symlinks. */
export type ProjectEntry = {
  readonly path: string;
  readonly kind: "file" | "dir" | "symlink";
  readonly target?: string;
};

export type PathEscapeError = {
  readonly kind: "PathEscape";
  readonly root: string;
  readonly relative: string;
};

const isAbsolute = (p: string): boolean => /^(?:\/|\\|[A-Za-z]:)/.test(p);

/**
 * Joins `relative` to `root` and normalizes the result. Fails when `relative` is absolute or when
 * the normalized result is not the root or a path under it.
 */
export const resolveInside = (root: string, relative: string): Result<string, PathEscapeError> => {
  const escaped = err({ kind: "PathEscape" as const, root, relative });
  if (isAbsolute(relative)) {
    return escaped;
  }
  const kept: string[] = [];
  for (const segment of relative.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (kept.length === 0) {
        return escaped;
      }
      kept.pop();
    } else {
      kept.push(segment);
    }
  }
  const base = root.replace(/\/+$/, "");
  return ok(kept.length === 0 ? (base === "" ? "/" : base) : `${base}/${kept.join("/")}`);
};

export type PlanItem = {
  readonly path: string;
  readonly action: "copy" | "skip" | "link";
  /** For `link`: the link target relative to the link's own directory. */
  readonly linkTarget?: string;
};

export type CopyPlan = readonly PlanItem[];

const FIXED_SKIPS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".trickortest",
  ".stryker-tmp",
]);

/** Path from the directory of `from` to `to`; both are project-relative and normalized. */
const relativeLink = (from: string, to: string): string => {
  const fromDir = from.split("/").slice(0, -1);
  const toParts = to.split("/");
  let common = 0;
  while (
    common < fromDir.length &&
    common < toParts.length - 1 &&
    fromDir[common] === toParts[common]
  ) {
    common += 1;
  }
  const ups = fromDir.slice(common).map(() => "..");
  return [...ups, ...toParts.slice(common)].join("/");
};

/** Normalizes a project-relative path; returns undefined when it is absolute or leaves the project. */
const normalizeInside = (p: string): string | undefined => {
  const resolved = resolveInside("/p", p);
  return resolved.ok && resolved.value !== "/p" ? resolved.value.slice("/p/".length) : undefined;
};

/**
 * Decides, for each project entry, whether the Sandbox copies it, skips it or recreates it as a
 * relative link (Requirement 5.18). The output directory rule is added separately.
 */
export const planSandboxCopy = (
  entries: readonly ProjectEntry[],
  _outputDirRelative: string,
): CopyPlan =>
  entries.map((entry): PlanItem => {
    const { path } = entry;
    if (path.split("/").some((segment) => FIXED_SKIPS.has(segment))) {
      return { path, action: "skip" };
    }
    if (entry.kind === "symlink") {
      const target = entry.target === undefined ? undefined : normalizeInside(entry.target);
      if (target === undefined) {
        return { path, action: "skip" };
      }
      return { path, action: "link", linkTarget: relativeLink(path, target) };
    }
    return { path, action: "copy" };
  });
