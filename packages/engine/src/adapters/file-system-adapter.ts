import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { err, ok, type Result } from "../core/result.js";
import type { ProjectEntry } from "../core/sandbox-plan.js";

export interface FileSystem {
  readFile(path: string): Promise<Result<string, string>>;
  writeFile(path: string, content: string): Promise<Result<void, string>>;
  copyDir(src: string, dest: string, exclude?: readonly string[]): Promise<Result<void, string>>;
  removeDir(path: string): Promise<Result<void, string>>;
  exists(path: string): Promise<boolean>;
  /**
   * Lists every file, directory and symlink under `root` with project-relative `/` paths. Symlink
   * targets are project-relative; a target outside the project starts with `..`. Links are not followed.
   */
  listEntries(root: string): Promise<ProjectEntry[]>;
  /** Copies one file, creating missing parent directories. */
  copyFile(src: string, dest: string): Promise<Result<void, string>>;
  /** Creates a directory and its missing parents. */
  makeDir(path: string): Promise<Result<void, string>>;
  /** Creates a symlink at `path` whose content is `target` (used verbatim). */
  makeLink(target: string, path: string): Promise<Result<void, string>>;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const toPosix = (path: string): string => path.split(sep).join("/");

/**
 * An entry without a slash matches a file or directory name at any depth.
 * An entry with a slash matches a path relative to the source directory.
 */
const buildCopyFilter = (src: string, exclude: readonly string[]) => {
  const names = new Set(exclude.filter((entry) => !entry.includes("/")));
  const paths = new Set(
    exclude
      .filter((entry) => entry.includes("/"))
      .map((entry) => entry.replace(/^\.\//, "").replace(/\/+$/, "")),
  );
  return (source: string): boolean => {
    const rel = toPosix(relative(src, source));
    if (rel === "") return true;
    const name = rel.slice(rel.lastIndexOf("/") + 1);
    return !(names.has(name) || paths.has(rel));
  };
};

/**
 * Recursive copy that allows the destination to live inside the source,
 * which `fs.cp` rejects. The filter is applied to every entry before it is
 * visited, so excluded directories (such as the sandbox root) are skipped.
 */
const copyTree = async (
  src: string,
  dest: string,
  filter: (source: string) => boolean,
): Promise<void> => {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = join(src, entry.name);
    if (!filter(from)) continue;
    const to = join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      await symlink(await readlink(from), to);
    } else if (entry.isDirectory()) {
      await copyTree(from, to, filter);
    } else if (entry.isFile()) {
      await copyFile(from, to);
    }
  }
};

/**
 * Resolves a symlink to a path relative to the project root. Uses `realpath` when the target
 * exists and falls back to lexical resolution for a broken link. A target outside the project
 * keeps a leading `..` segment, which `planSandboxCopy` treats as outside.
 */
const resolveLinkTarget = async (realRoot: string, linkPath: string): Promise<string> => {
  let resolved: string;
  try {
    resolved = await realpath(linkPath);
  } catch {
    resolved = resolve(dirname(linkPath), await readlink(linkPath));
  }
  return toPosix(relative(realRoot, resolved));
};

const walkEntries = async (realRoot: string, dir: string, out: ProjectEntry[]): Promise<void> => {
  const children = await readdir(dir, { withFileTypes: true });
  children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const child of children) {
    const abs = join(dir, child.name);
    const path = toPosix(relative(realRoot, abs));
    if (child.isSymbolicLink()) {
      out.push({ path, kind: "symlink", target: await resolveLinkTarget(realRoot, abs) });
    } else if (child.isDirectory()) {
      out.push({ path, kind: "dir" });
      await walkEntries(realRoot, abs, out);
    } else if (child.isFile()) {
      out.push({ path, kind: "file" });
    }
  }
};

export const createFileSystem = (): FileSystem => ({
  async listEntries(root) {
    const realRoot = await realpath(root);
    const out: ProjectEntry[] = [];
    await walkEntries(realRoot, realRoot, out);
    return out;
  },

  async copyFile(src, dest) {
    try {
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(src, dest);
      return ok(undefined);
    } catch (error) {
      return err(`Cannot copy ${src} to ${dest}: ${messageOf(error)}`);
    }
  },

  async makeDir(path) {
    try {
      await mkdir(path, { recursive: true });
      return ok(undefined);
    } catch (error) {
      return err(`Cannot create ${path}: ${messageOf(error)}`);
    }
  },

  async makeLink(target, path) {
    try {
      await mkdir(dirname(path), { recursive: true });
      await symlink(target, path);
      return ok(undefined);
    } catch (error) {
      return err(`Cannot link ${path}: ${messageOf(error)}`);
    }
  },

  async readFile(path) {
    try {
      return ok(await readFile(path, "utf8"));
    } catch (error) {
      return err(`Cannot read ${path}: ${messageOf(error)}`);
    }
  },

  async writeFile(path, content) {
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
      return ok(undefined);
    } catch (error) {
      return err(`Cannot write ${path}: ${messageOf(error)}`);
    }
  },

  async copyDir(src, dest, exclude = []) {
    try {
      await copyTree(src, dest, buildCopyFilter(src, exclude));
      return ok(undefined);
    } catch (error) {
      return err(`Cannot copy ${src} to ${dest}: ${messageOf(error)}`);
    }
  },

  async removeDir(path) {
    try {
      await rm(path, { recursive: true, force: true });
      return ok(undefined);
    } catch (error) {
      return err(`Cannot remove ${path}: ${messageOf(error)}`);
    }
  },

  async exists(path) {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
});
