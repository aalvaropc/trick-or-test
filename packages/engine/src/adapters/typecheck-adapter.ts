import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { err, ok, type Result } from "../core/result.js";

export type CompileError = {
  readonly kind: "CompileError";
  /** First line of the compiler output that reports an error (or a fallback message). */
  readonly firstError: string;
};

/** Walks up from `start` to find the nearest `node_modules/typescript/bin/tsc`. */
const findTsc = (start: string): string | undefined => {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, "node_modules", "typescript", "bin", "tsc");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

const ERROR_LINE = /\berror TS\d+:/;

const firstErrorLine = (output: string): string => {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return lines.find((line) => ERROR_LINE.test(line)) ?? lines[0] ?? "tsc failed with no output";
};

export const Typecheck = {
  /**
   * Runs the target project's `tsc --noEmit` in `sandboxRoot`. TypeScript 7 has no
   * JS API, so the tsc binary is spawned, resolved from the nearest node_modules.
   */
  run(sandboxRoot: string): Promise<Result<void, CompileError>> {
    const tsc = findTsc(sandboxRoot);
    if (tsc === undefined) {
      return Promise.resolve(
        err({
          kind: "CompileError",
          firstError: `Cannot find typescript in node_modules above ${sandboxRoot}`,
        }),
      );
    }
    return new Promise((done) => {
      execFile(
        process.execPath,
        [tsc, "--noEmit", "--pretty", "false"],
        { cwd: sandboxRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (!error) {
            done(ok(undefined));
            return;
          }
          const output = `${String(stdout)}\n${String(stderr)}`;
          done(err({ kind: "CompileError", firstError: firstErrorLine(output) }));
        },
      );
    });
  },
};
