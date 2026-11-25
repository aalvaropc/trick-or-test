import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "../core/result.js";
import { extractFailingTests } from "../core/suite-result.js";
import { ProcessRunner } from "./process-runner.js";

export type SuiteTestStatus = "passed" | "failed" | "skipped";

export type SuiteTest = {
  readonly name: string;
  readonly status: SuiteTestStatus;
  /** 1-based line where the test starts (from Vitest's `includeTaskLocation`). */
  readonly startLine: number;
};

export type SuiteFile = {
  /** Path relative to the run root, with forward slashes. */
  readonly path: string;
  readonly tests: readonly SuiteTest[];
};

export type SuiteResult = {
  /** Wall-clock duration of the whole Vitest process. */
  readonly durationMs: number;
  readonly files: readonly SuiteFile[];
};

export type SuiteRunOptions = {
  /** Suite time limit, enforced as a process timeout. */
  readonly timeLimitMs: number;
  /** Optional file filters passed to Vitest (substring match on paths). */
  readonly testFiles?: readonly string[];
};

export type SuiteError =
  | { readonly kind: "Timeout"; readonly limitMs: number }
  | { readonly kind: "RunError"; readonly message: string };

const reportSchema = z.object({
  testResults: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      assertionResults: z.array(
        z.object({
          fullName: z.string(),
          status: z.string(),
          location: z.object({ line: z.number().int().positive() }).optional(),
        }),
      ),
    }),
  ),
});

const toStatus = (raw: string): SuiteTestStatus =>
  raw === "passed" ? "passed" : raw === "failed" ? "failed" : "skipped";

/** Walks up from `start` to find the nearest `node_modules/vitest/vitest.mjs`. */
const findVitest = (start: string): string | undefined => {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, "node_modules", "vitest", "vitest.mjs");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

const firstLine = (text: string, fallback: string): string =>
  text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "") ?? fallback;

type Outcome = {
  readonly timedOut: boolean;
  readonly stderr: string;
  readonly spawnError?: string;
};

const runProcess = async (
  vitest: string,
  args: readonly string[],
  cwd: string,
  limitMs: number,
): Promise<Outcome> => {
  // Vitest runs tests in worker processes: the runner kills the whole process group.
  const result = await ProcessRunner.run(process.execPath, [vitest, ...args], {
    cwd,
    timeoutMs: limitMs,
    maxOutputBytes: 64 * 1024,
  });
  return {
    timedOut: result.timedOut,
    stderr: result.stderr,
    ...(result.spawnError !== undefined ? { spawnError: result.spawnError } : {}),
  };
};

export const SuiteRunner = {
  /**
   * Runs the target's own Vitest in `root` once, with the JSON reporter and task
   * locations. Failing tests are a normal result; a run that exceeds the time limit
   * returns a Timeout error and a run that produces no report returns a RunError.
   */
  async run(root: string, options: SuiteRunOptions): Promise<Result<SuiteResult, SuiteError>> {
    const vitest = findVitest(root);
    if (vitest === undefined) {
      return err({ kind: "RunError", message: `Cannot find vitest in node_modules above ${root}` });
    }
    const outDir = await mkdtemp(join(tmpdir(), "trickortest-suite-"));
    const outFile = join(outDir, "report.json");
    try {
      const args = [
        "run",
        "--reporter=json",
        `--outputFile=${outFile}`,
        "--includeTaskLocation",
        ...(options.testFiles ?? []),
      ];
      const started = performance.now();
      const outcome = await runProcess(vitest, args, root, options.timeLimitMs);
      const durationMs = performance.now() - started;
      if (outcome.timedOut) return err({ kind: "Timeout", limitMs: options.timeLimitMs });
      if (outcome.spawnError !== undefined) {
        return err({ kind: "RunError", message: outcome.spawnError });
      }
      let text: string;
      try {
        text = await readFile(outFile, "utf8");
      } catch {
        return err({
          kind: "RunError",
          message: firstLine(outcome.stderr, "vitest produced no JSON report"),
        });
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return err({ kind: "RunError", message: "vitest produced an invalid JSON report" });
      }
      const parsed = reportSchema.safeParse(json);
      if (!parsed.success) {
        return err({
          kind: "RunError",
          message: `vitest JSON report does not match the expected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        });
      }
      // A file that failed without any assertion result (import or collection error)
      // is reported as one failing test named after the file (Requirements 3.15, 5.9).
      const fileLevelFailures = new Set(
        extractFailingTests(parsed.data)
          .filter((failing) => failing.name === failing.filePath)
          .map((failing) => failing.filePath),
      );
      const files = parsed.data.testResults.map((file) => {
        const path = relative(root, file.name).split("\\").join("/");
        if (file.assertionResults.length === 0 && fileLevelFailures.has(file.name)) {
          return { path, tests: [{ name: path, status: "failed" as const, startLine: 0 }] };
        }
        return {
          path,
          tests: file.assertionResults.map((test) => ({
            name: test.fullName,
            status: toStatus(test.status),
            startLine: test.location?.line ?? 0,
          })),
        };
      });
      return ok({ durationMs, files });
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  },
};
