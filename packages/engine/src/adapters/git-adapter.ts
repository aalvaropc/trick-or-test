import { execFile } from "node:child_process";
import type { ChangedRange } from "../core/changed-ranges.js";
import { err, ok, type Result } from "../core/result.js";

export type { ChangedRange };

export const formatChangedRange = (range: ChangedRange): string =>
  `${range.file}:${range.start}-${range.end}`;

const runGit = (args: readonly string[], cwd: string): Promise<Result<string, string>> =>
  new Promise((resolve) => {
    execFile(
      "git",
      [...args],
      { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr).trim() || error.message;
          resolve(err(`git ${args[0]} failed: ${detail}`));
          return;
        }
        resolve(ok(stdout));
      },
    );
  });

export const Git = {
  /**
   * The diff text of the working tree against `ref`, restricted to the directory
   * `cwd` (the Target_Project) with paths relative to it. Sibling directories of a
   * monorepo do not appear. The text is parsed by `parseChangedRanges`.
   */
  async diff(ref: string, cwd: string = process.cwd()): Promise<Result<string, string>> {
    if (ref === "" || ref.startsWith("-")) {
      return err(`Invalid git ref: ${JSON.stringify(ref)}`);
    }
    return runGit(
      [
        "-c",
        "core.quotepath=off",
        "diff",
        "--relative",
        "--unified=0",
        "--no-color",
        "--no-ext-diff",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        ref,
        "--",
        ".",
      ],
      cwd,
    );
  },

  /** Full hash of HEAD, for the run metadata. */
  async currentCommit(cwd: string = process.cwd()): Promise<Result<string, string>> {
    const output = await runGit(["rev-parse", "HEAD"], cwd);
    if (!output.ok) return output;
    return ok(output.value.trim());
  },
};
