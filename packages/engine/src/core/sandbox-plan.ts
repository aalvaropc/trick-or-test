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
