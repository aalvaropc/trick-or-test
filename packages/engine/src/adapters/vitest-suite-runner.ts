import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "../core/result.js";

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

const runProcess = (
  vitest: string,
  args: readonly string[],
  cwd: string,
  limitMs: number,
): Promise<Outcome> =>
  new Promise((done) => {
    const child = spawn(process.execPath, [vitest, ...args], {
      cwd,
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    let timedOut = false;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 64 * 1024) stderr += chunk;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      // Vitest runs tests in worker processes: kill the whole process group.
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, limitMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ timedOut, stderr, spawnError: error.message });
    });
    child.on("close", () => {
      clearTimeout(timer);
      done({ timedOut, stderr });
    });
  });

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
      const files = parsed.data.testResults.map((file) => ({
        path: relative(root, file.name).split("\\").join("/"),
        tests: file.assertionResults.map((test) => ({
          name: test.fullName,
          status: toStatus(test.status),
          startLine: test.location?.line ?? 0,
        })),
      }));
      return ok({ durationMs, files });
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  },
};
