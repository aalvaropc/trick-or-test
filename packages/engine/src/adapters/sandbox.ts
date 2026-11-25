import { join } from "node:path";
import { err, ok, type Result } from "../core/result.js";
import { type PathEscapeError, planSandboxCopy, resolveInside } from "../core/sandbox-plan.js";
import { createFileSystem, type FileSystem } from "./file-system-adapter.js";

export interface SandboxHandle {
  readonly id: string;
  readonly projectRoot: string;
  readonly root: string;
}

export interface SandboxOptions {
  readonly fs?: FileSystem;
  /** Output directory, relative to the project root, kept out of the copy. */
  readonly outputDir?: string;
  /** Receives a warning for each skipped link. Defaults to standard error. */
  readonly warn?: (message: string) => void;
}

const WORK_DIR = ".trickortest";
const SKIPPED_NAMES: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  WORK_DIR,
  ".stryker-tmp",
]);

const escapeMessage = (error: PathEscapeError): string =>
  `Path escapes the sandbox: ${JSON.stringify(error.relative)} is not inside ${error.root}`;

/**
 * Copies the project into `root` following `planSandboxCopy`. Every destination, and every source,
 * goes through `resolveInside` before it is touched (Requirement 5.17). Links that point outside the
 * project are skipped with a warning (5.18).
 */
const copyPlanned = async (
  fs: FileSystem,
  projectRoot: string,
  root: string,
  outputDir: string,
  warn: (message: string) => void,
): Promise<Result<void, string>> => {
  const entries = await fs.listEntries(projectRoot);
  const plan = planSandboxCopy(entries, outputDir);
  const kinds = new Map(entries.map((entry) => [entry.path, entry.kind]));
  const made = await fs.makeDir(root);
  if (!made.ok) return made;
  for (const item of plan) {
    const inOutputDir =
      outputDir !== "" &&
      outputDir !== "." &&
      (item.path === outputDir || item.path.startsWith(`${outputDir}/`));
    if (inOutputDir) continue;
    const kind = kinds.get(item.path);
    if (item.action === "skip") {
      if (kind === "symlink" && !item.path.split("/").some((s) => SKIPPED_NAMES.has(s))) {
        warn(`Skipped link ${item.path}: it points outside the project`);
      }
      continue;
    }
    const dest = resolveInside(root, item.path);
    if (!dest.ok) return err(escapeMessage(dest.error));
    const source = resolveInside(projectRoot, item.path);
    if (!source.ok) return err(escapeMessage(source.error));
    const done =
      item.action === "link"
        ? await fs.makeLink(item.linkTarget ?? "", dest.value)
        : kind === "dir"
          ? await fs.makeDir(dest.value)
          : await fs.copyFile(source.value, dest.value);
    if (!done.ok) return done;
  }
  return ok(undefined);
};

const normalizeOutputDir = (outputDir: string): string =>
  outputDir.replace(/^\.\//, "").replace(/\/+$/, "");

const isSafeId = (id: string): boolean =>
  id.length > 0 && id !== "." && id !== ".." && !/[\\/]/.test(id);

export const Sandbox = {
  async create(
    projectRoot: string,
    id: string,
    options: SandboxOptions = {},
  ): Promise<Result<SandboxHandle, string>> {
    if (!isSafeId(id)) return err(`Invalid sandbox id: ${JSON.stringify(id)}`);
    const fs = options.fs ?? createFileSystem();
    const outputDir = options.outputDir === undefined ? "" : normalizeOutputDir(options.outputDir);

    const gitignore = await fs.writeFile(join(projectRoot, WORK_DIR, ".gitignore"), "*\n");
    if (!gitignore.ok) return gitignore;

    const root = join(projectRoot, WORK_DIR, "sandboxes", id);
    const warn = options.warn ?? ((message: string) => void process.stderr.write(`${message}\n`));
    const copied = await copyPlanned(fs, projectRoot, root, outputDir, warn);
    if (!copied.ok) {
      await fs.removeDir(root);
      return copied;
    }
    return ok({ id, projectRoot, root });
  },

  async destroy(
    handle: SandboxHandle,
    options: SandboxOptions = {},
  ): Promise<Result<void, string>> {
    const fs = options.fs ?? createFileSystem();
    return fs.removeDir(handle.root);
  },
};

/** Creates a sandbox, runs `fn`, and always destroys the sandbox afterwards. */
export const withSandbox = async <T>(
  projectRoot: string,
  id: string,
  fn: (handle: SandboxHandle) => Promise<T>,
  options: SandboxOptions = {},
): Promise<Result<T, string>> => {
  const created = await Sandbox.create(projectRoot, id, options);
  if (!created.ok) return created;
  try {
    return ok(await fn(created.value));
  } finally {
    await Sandbox.destroy(created.value, options);
  }
};
