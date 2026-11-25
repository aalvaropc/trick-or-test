import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, sep } from "node:path";
import { err, ok, type Result } from "../core/result.js";

export interface FileSystem {
  readFile(path: string): Promise<Result<string, string>>;
  writeFile(path: string, content: string): Promise<Result<void, string>>;
  copyDir(src: string, dest: string, exclude?: readonly string[]): Promise<Result<void, string>>;
  removeDir(path: string): Promise<Result<void, string>>;
  exists(path: string): Promise<boolean>;
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

export const createFileSystem = (): FileSystem => ({
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
      await cp(src, dest, { recursive: true, filter: buildCopyFilter(src, exclude) });
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
