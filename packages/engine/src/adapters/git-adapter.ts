import { execFile } from "node:child_process";
import { z } from "zod";
import { err, ok, type Result } from "../core/result.js";

export const ChangedRangeSchema = z
  .object({
    file: z.string().min(1),
    start: z.number().int().min(1),
    end: z.number().int().min(1),
  })
  .refine((range) => range.end >= range.start, { message: "end must be >= start" });

export type ChangedRange = z.infer<typeof ChangedRangeSchema>;

export const formatChangedRange = (range: ChangedRange): string =>
  `${range.file}:${range.start}-${range.end}`;

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

const unquotePath = (raw: string): string => {
  if (!raw.startsWith('"')) return raw;
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw;
  }
};

/**
 * Parses `git diff --unified=0` output into the line ranges added or changed
 * on the new side. Hunks that only delete lines have no new-side lines and
 * yield no range. Deleted files (`+++ /dev/null`) yield no range.
 */
export const parseChangedRanges = (diff: string): Result<ChangedRange[], string> => {
  const candidates: unknown[] = [];
  let file: string | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = unquotePath(line.slice(4).replace(/\r$/, ""));
      file = target === "/dev/null" ? undefined : target.replace(/^b\//, "");
      continue;
    }
    if (line.startsWith("diff --git ")) {
      file = undefined;
      continue;
    }
    const match = HUNK_HEADER.exec(line);
    if (!match || file === undefined) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count === 0) continue;
    candidates.push({ file, start, end: start + count - 1 });
  }
  const parsed = z.array(ChangedRangeSchema).safeParse(candidates);
  return parsed.success
    ? ok(parsed.data)
    : err(`Cannot parse git diff output: ${parsed.error.message}`);
};

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
  /** Line ranges changed in the working tree since `ref`, as `file:start-end` data. */
  async changedRanges(
    ref: string,
    cwd: string = process.cwd(),
  ): Promise<Result<ChangedRange[], string>> {
    if (ref === "" || ref.startsWith("-")) {
      return err(`Invalid git ref: ${JSON.stringify(ref)}`);
    }
    const output = await runGit(
      [
        "-c",
        "core.quotepath=off",
        "diff",
        "--unified=0",
        "--no-color",
        "--no-ext-diff",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        ref,
        "--",
      ],
      cwd,
    );
    if (!output.ok) return output;
    return parseChangedRanges(output.value);
  },

  /** Full hash of HEAD, for the run metadata. */
  async currentCommit(cwd: string = process.cwd()): Promise<Result<string, string>> {
    const output = await runGit(["rev-parse", "HEAD"], cwd);
    if (!output.ok) return output;
    return ok(output.value.trim());
  },
};
