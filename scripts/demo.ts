/**
 * Demo generator: produces the two demo runs the viewer links to.
 *
 * Usage: npm run demo
 *
 * "before" is `measure` on examples/pricing as it is. "after" is `measure` on a throwaway copy
 * of it under .trickortest/ that also holds the Guard_Test. Every report, verdict and history
 * file comes from the engine, except the copy of the "before" history that lets the engine
 * append the second record. The plan is pure data; the shell below runs it.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface FileCopy {
  readonly from: string;
  readonly to: string;
}

export type Step =
  | {
      readonly kind: "build";
      readonly command: string;
      readonly args: readonly string[];
      readonly cwd: string;
    }
  | { readonly kind: "clean"; readonly paths: readonly string[] }
  | {
      readonly kind: "measure";
      readonly run: "before" | "after";
      readonly command: string;
      readonly args: readonly string[];
      readonly cwd: string;
      readonly project: string;
      readonly spec: string;
      readonly output: string;
    }
  | {
      readonly kind: "copy";
      readonly from: string;
      readonly to: string;
      readonly exclude: readonly string[];
      readonly add: readonly FileCopy[];
    }
  | { readonly kind: "remove"; readonly path: string };

export interface Executor {
  run(step: Step): void;
}

const PROJECT = "examples/pricing";
const SPEC = "cart-pricing";
const BEFORE = "apps/viewer/public/demo/before";
const AFTER = "apps/viewer/public/demo/after";
const COPY = ".trickortest/demo-after";
const OUTPUT_FILES = ["mutation-report.json", "verdict.json", "history.jsonl"] as const;

function measureStep(run: "before" | "after", root: string, project: string, output: string): Step {
  return {
    kind: "measure",
    run,
    command: "npx",
    args: ["trick-or-test", "measure", "--project", project, "--spec", SPEC, "--output", output],
    cwd: root,
    project,
    spec: SPEC,
    output,
  };
}

/** The ordered steps of one demo run. `root` is the working directory of the processes. */
export function planDemo(root: string): Step[] {
  return [
    {
      kind: "build",
      command: "npm",
      args: ["run", "build", "-w", "trick-or-test"],
      cwd: root,
    },
    {
      kind: "clean",
      paths: [BEFORE, AFTER].flatMap((dir) => OUTPUT_FILES.map((file) => `${dir}/${file}`)),
    },
    measureStep("before", root, PROJECT, BEFORE),
    {
      kind: "copy",
      from: PROJECT,
      to: COPY,
      exclude: ["node_modules", "reports", ".stryker-tmp", ".trickortest"],
      add: [
        {
          from: "scripts/demo/after/guard-7.4.test.ts",
          to: `${COPY}/extra/guard-7.4.test.ts`,
        },
        { from: "scripts/demo/after/vitest.config.ts", to: `${COPY}/vitest.config.ts` },
      ],
    },
    {
      kind: "copy",
      from: `${BEFORE}/history.jsonl`,
      to: `${AFTER}/history.jsonl`,
      exclude: [],
      add: [],
    },
    measureStep("after", root, COPY, AFTER),
    { kind: "remove", path: COPY },
  ];
}

/** Runs the steps in order. Every `remove` step runs even when an earlier step throws. */
export function runSteps(steps: readonly Step[], executor: Executor): void {
  const started = new Set<Step>();
  try {
    for (const step of steps) {
      started.add(step);
      executor.run(step);
    }
  } finally {
    for (const step of steps) {
      if (step.kind === "remove" && !started.has(step)) executor.run(step);
    }
  }
}

function spawn(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

function copyFile(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

export function shell(root: string): Executor {
  const at = (path: string) => resolve(root, path);
  return {
    run(step) {
      switch (step.kind) {
        case "build":
        case "measure":
          spawn(step.command, step.args, at(step.cwd));
          break;
        case "clean":
          for (const path of step.paths) rmSync(at(path), { force: true });
          break;
        case "copy": {
          const excluded = new Set(step.exclude);
          rmSync(at(step.to), { force: true, recursive: true });
          mkdirSync(dirname(at(step.to)), { recursive: true });
          cpSync(at(step.from), at(step.to), {
            recursive: true,
            filter: (source) => !excluded.has(basename(source)),
          });
          for (const file of step.add) copyFile(at(file.from), at(file.to));
          break;
        }
        case "remove":
          rmSync(at(step.path), { force: true, recursive: true });
          break;
      }
    },
  };
}

export function main(): number {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    runSteps(planDemo("."), shell(root));
    return 0;
  } catch (error) {
    console.error(`demo: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
