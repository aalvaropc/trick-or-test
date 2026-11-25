import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "../core/result.js";
import type { MutantId, Witness } from "../core/types.js";
import type { WitnessOutcome } from "../core/witness-compare.js";

export type WitnessInput = {
  readonly id: MutantId;
  readonly witness: Witness;
};

export type WitnessRunOptions = {
  /** Process timeout for the witness run. Defaults to 120 seconds. */
  readonly timeLimitMs?: number;
  /** Time limit for each witness call. Defaults to 10 seconds. */
  readonly witnessTimeLimitMs?: number;
};

/** A witness that produced no outcome file (for example, its import failed). */
export type WitnessFailure = { readonly kind: "NoOutcome"; readonly message: string };

export type WitnessRunError =
  | { readonly kind: "Timeout"; readonly limitMs: number }
  | { readonly kind: "RunError"; readonly message: string };

export type WitnessRunResult = Record<MutantId, Result<WitnessOutcome, WitnessFailure>>;

const WITNESS_DIR = join(".trickortest", "witnesses");
const CONFIG_CANDIDATES = [
  "vitest.config.ts",
  "vitest.config.mts",
  "vitest.config.js",
  "vitest.config.mjs",
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.js",
  "vite.config.mjs",
];

const outcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("value"), value: z.unknown() }),
  z.object({ kind: z.literal("error"), className: z.string() }),
  z.object({ kind: z.literal("timeout"), message: z.string() }),
]);

const reportSchema = z.object({
  testResults: z.array(z.object({ name: z.string(), message: z.string().optional() })),
});

const lit = (value: unknown): string => JSON.stringify(value) ?? "null";

/** Source of one witness test file. It reports through the outcome file only. */
const witnessSource = (
  entry: WitnessInput,
  importPath: string,
  outcomePath: string,
  witnessLimitMs: number,
): string =>
  [
    `import { writeFileSync } from "node:fs";`,
    `import { it } from "vitest";`,
    `import * as target from ${lit(importPath)};`,
    ``,
    `it(${lit(`witness ${entry.id}`)}, async () => {`,
    `  const fn = (target as Record<string, unknown>)[${lit(entry.witness.export)}];`,
    `  if (typeof fn !== "function") {`,
    `    throw new Error(${lit(`export ${entry.witness.export} is not a function`)});`,
    `  }`,
    `  const limitMs = ${witnessLimitMs};`,
    `  const timedOut = Symbol("timeout");`,
    `  let timer: ReturnType<typeof setTimeout> | undefined;`,
    `  const deadline = new Promise<typeof timedOut>((resolve) => {`,
    `    timer = setTimeout(() => resolve(timedOut), limitMs);`,
    `  });`,
    `  let outcome: unknown;`,
    `  try {`,
    `    const value = await Promise.race([`,
    `      Promise.resolve(fn(...(${lit(entry.witness.args)} as unknown[]))),`,
    `      deadline,`,
    `    ]);`,
    `    outcome =`,
    `      value === timedOut`,
    `        ? { kind: "timeout", message: "witness did not finish within " + limitMs + " ms" }`,
    `        : { kind: "value", value: value === undefined ? null : value };`,
    `  } catch (error) {`,
    `    const className =`,
    `      error !== null && typeof error === "object" ? error.constructor.name : typeof error;`,
    `    outcome = { kind: "error", className };`,
    `  } finally {`,
    `    clearTimeout(timer);`,
    `  }`,
    `  writeFileSync(${lit(outcomePath)}, JSON.stringify(outcome));`,
    `}, ${witnessLimitMs + 10_000});`,
    ``,
  ].join("\n");

/** Vitest config that reuses the target config but includes only the witness files. */
const configSource = (targetConfig: string | undefined, sandboxRoot: string): string =>
  [
    ...(targetConfig === undefined ? [] : [`import target from ${lit(targetConfig)};`]),
    ``,
    `const base: any = ${targetConfig === undefined ? "{}" : `typeof target === "function" ? await target({ command: "serve", mode: "test" }) : await target`};`,
    ``,
    `export default {`,
    `  ...base,`,
    `  root: ${lit(sandboxRoot)},`,
    `  test: {`,
    `    ...base.test,`,
    `    include: [${lit(`${WITNESS_DIR.split("\\").join("/")}/*.witness.test.ts`)}],`,
    `    exclude: ["**/node_modules/**"],`,
    `    // The target suite's setup files and test project name do not apply to witnesses.`,
    `    setupFiles: [],`,
    `    projects: undefined,`,
    `    name: undefined,`,
    `  },`,
    `};`,
    ``,
  ].join("\n");

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

type ProcessOutcome = { readonly timedOut: boolean; readonly spawnError?: string };

const runProcess = (
  vitest: string,
  args: readonly string[],
  cwd: string,
  limitMs: number,
): Promise<ProcessOutcome> =>
  new Promise((done) => {
    const child = spawn(process.execPath, [vitest, ...args], {
      cwd,
      detached: true,
      stdio: "ignore",
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, limitMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ timedOut, spawnError: error.message });
    });
    child.on("close", () => {
      clearTimeout(timer);
      done({ timedOut });
    });
  });

const firstLine = (text: string): string =>
  text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "") ?? "witness produced no outcome";

const readFailureMessages = async (reportFile: string): Promise<Map<string, string>> => {
  const messages = new Map<string, string>();
  try {
    const parsed = reportSchema.safeParse(JSON.parse(await readFile(reportFile, "utf8")));
    if (!parsed.success) return messages;
    for (const file of parsed.data.testResults) {
      if (file.message !== undefined && file.message !== "") {
        messages.set(file.name, firstLine(file.message));
      }
    }
  } catch {
    // No readable report: the caller falls back to a generic message.
  }
  return messages;
};

const readOutcome = async (
  outcomeFile: string,
  fallback: string,
): Promise<Result<WitnessOutcome, WitnessFailure>> => {
  let text: string;
  try {
    text = await readFile(outcomeFile, "utf8");
  } catch {
    return err({ kind: "NoOutcome", message: fallback });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err({ kind: "NoOutcome", message: "outcome file is not valid JSON" });
  }
  const parsed = outcomeSchema.safeParse(json);
  if (!parsed.success) {
    return err({ kind: "NoOutcome", message: "outcome file does not match the expected shape" });
  }
  switch (parsed.data.kind) {
    case "value":
      return ok({ kind: "value", value: parsed.data.value ?? null });
    case "error":
      return ok({ kind: "error", className: parsed.data.className });
    case "timeout":
      return ok({ kind: "timeout", message: parsed.data.message });
  }
};

/** Makes a message project-relative: the sandbox root is removed from every path. */
const relativize = (text: string, root: string): string =>
  text.split(`${root}${sep}`).join("").split(root).join(".");

export const WitnessRunner = {
  /**
   * Runs every witness once, in one Vitest process, inside `sandboxRoot`. Outcomes are
   * read from per-witness outcome files, never from console output. A witness whose
   * file could not run (for example, its import fails) yields a `NoOutcome` failure.
   */
  async run(
    sandboxRoot: string,
    witnesses: readonly WitnessInput[],
    options: WitnessRunOptions = {},
  ): Promise<Result<WitnessRunResult, WitnessRunError>> {
    const limitMs = options.timeLimitMs ?? 120_000;
    const witnessLimitMs = options.witnessTimeLimitMs ?? 10_000;
    const vitest = findVitest(sandboxRoot);
    if (vitest === undefined) {
      return err({
        kind: "RunError",
        message: `Cannot find vitest in node_modules above ${sandboxRoot}`,
      });
    }

    const dir = join(sandboxRoot, WITNESS_DIR);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

    const targetConfigName = CONFIG_CANDIDATES.find((name) => existsSync(join(sandboxRoot, name)));
    const configFile = join(dir, "vitest.config.ts");
    const reportFile = join(dir, "report.json");
    await writeFile(
      configFile,
      configSource(
        targetConfigName === undefined ? undefined : join(sandboxRoot, targetConfigName),
        sandboxRoot,
      ),
    );

    for (const entry of witnesses) {
      const importPath = resolve(sandboxRoot, entry.witness.from);
      await writeFile(
        join(dir, `${entry.id}.witness.test.ts`),
        witnessSource(entry, importPath, join(dir, `${entry.id}.outcome.json`), witnessLimitMs),
      );
    }

    const outcome = await runProcess(
      vitest,
      [
        "run",
        `--config=${configFile}`,
        `--root=${sandboxRoot}`,
        "--reporter=json",
        `--outputFile=${reportFile}`,
      ],
      sandboxRoot,
      limitMs,
    );
    if (outcome.timedOut) return err({ kind: "Timeout", limitMs });
    if (outcome.spawnError !== undefined) {
      return err({ kind: "RunError", message: outcome.spawnError });
    }

    const messages = await readFailureMessages(reportFile);
    const results: WitnessRunResult = {};
    for (const entry of witnesses) {
      const fallback = relativize(
        messages.get(join(dir, `${entry.id}.witness.test.ts`)) ?? "witness produced no outcome",
        sandboxRoot,
      );
      results[entry.id] = await readOutcome(join(dir, `${entry.id}.outcome.json`), fallback);
    }
    return ok(results);
  },
};
