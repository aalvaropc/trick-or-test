import { join } from "node:path";
import { err, ok, type Result } from "../core/result.js";
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
}

const WORK_DIR = ".trickortest";
const ALWAYS_EXCLUDED = ["node_modules", ".git", WORK_DIR, ".stryker-tmp"] as const;

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
    const exclude: string[] = [...ALWAYS_EXCLUDED];
    const outputDir = options.outputDir === undefined ? "" : normalizeOutputDir(options.outputDir);
    if (outputDir !== "" && outputDir !== ".") exclude.push(outputDir);

    const gitignore = await fs.writeFile(join(projectRoot, WORK_DIR, ".gitignore"), "*\n");
    if (!gitignore.ok) return gitignore;

    const root = join(projectRoot, WORK_DIR, "sandboxes", id);
    const copied = await fs.copyDir(projectRoot, root, exclude);
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
