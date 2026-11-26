import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { containsAbsolutePath } from "../../src/core/paths.js";
import { parseHistoryLines } from "../../src/core/report.js";

// End-to-end spec-only run of the built CLI against examples/pricing.
// Runs only through `npm run test:e2e --workspace trick-or-test`.

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const project = join(repoRoot, "examples", "pricing");
const cliPath = join(repoRoot, "packages", "engine", "dist", "cli", "main.js");
const scratchDir = join(project, ".trickortest", "e2e-spec-only");
const specOnlyDir = join(scratchDir, "spec-only");
const fullDir = join(scratchDir, "full");
const strykerTmpDir = join(project, ".trickortest", "stryker-tmp");

interface CliRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly ms: number;
}

const exec = (command: string, args: string[], cwd: string): Promise<CliRun> =>
  new Promise((done) => {
    const started = performance.now();
    execFile(
      command,
      args,
      { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : Number.NaN;
        done({
          code,
          stdout: String(stdout),
          stderr: String(stderr),
          ms: performance.now() - started,
        });
      },
    );
  });

const collectStrings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      collectStrings(item, out);
    }
  }
  return out;
};

const baseArgs = (output: string): string[] => [
  cliPath,
  "measure",
  "--project",
  project,
  "--spec",
  "cart-pricing",
  "--output",
  output,
];

interface ReportShape {
  config?: { scope?: string };
  files: Record<string, { mutants: { id: string; mutatorName: string }[] }>;
}

interface VerdictShape {
  metadata: { scope?: string };
  mutants: { id: string; species: string }[];
  mutantCounts?: { mechanical?: unknown };
  strykerCounts?: unknown;
}

describe("pricing spec-only end-to-end", () => {
  let specOnly: CliRun;
  let full: CliRun;
  let strykerTmpExistedAfterSpecOnly = true;
  let gitStatusAfter = "";
  let gitStatusBefore = "";
  let reportText = "";
  let verdictText = "";
  let historyText = "";
  let report: ReportShape;
  let verdict: VerdictShape;

  beforeAll(async () => {
    const build = await exec("npm", ["run", "build", "--workspace", "trick-or-test"], repoRoot);
    expect(build.code, build.stdout + build.stderr).toBe(0);

    await rm(scratchDir, { recursive: true, force: true });
    await rm(strykerTmpDir, { recursive: true, force: true });
    await mkdir(scratchDir, { recursive: true });

    gitStatusBefore = (await exec("git", ["status", "--porcelain", "examples/pricing"], repoRoot))
      .stdout;

    specOnly = await exec(
      process.execPath,
      [...baseArgs(specOnlyDir), "--scope", "spec-only"],
      repoRoot,
    );
    strykerTmpExistedAfterSpecOnly = existsSync(strykerTmpDir);

    // A full run on the same project gives the reference time. It runs after the check above.
    full = await exec(process.execPath, baseArgs(fullDir), repoRoot);
    console.log(
      `spec-only run: ${(specOnly.ms / 1000).toFixed(1)} s, full run: ${(full.ms / 1000).toFixed(1)} s`,
    );

    gitStatusAfter = (await exec("git", ["status", "--porcelain", "examples/pricing"], repoRoot))
      .stdout;

    reportText = await readFile(join(specOnlyDir, "mutation-report.json"), "utf8");
    verdictText = await readFile(join(specOnlyDir, "verdict.json"), "utf8");
    historyText = await readFile(join(specOnlyDir, "history.jsonl"), "utf8");
    report = JSON.parse(reportText) as ReportShape;
    verdict = JSON.parse(verdictText) as VerdictShape;
  }, 900_000);

  afterAll(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it("9.18 the spec-only run exits with code 0 and creates no StrykerJS temporary directory", () => {
    expect(specOnly.code, specOnly.stderr).toBe(0);
    expect(strykerTmpExistedAfterSpecOnly).toBe(false);
  });

  it("9.21 the summary names the scope and says that strays were not run", () => {
    expect(specOnly.stdout).toContain("spec-only");
    expect(specOnly.stdout).toContain("not run");
  });

  it("10.8 the three files carry the scope spec-only", () => {
    const history = parseHistoryLines(historyText);
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.value).toHaveLength(1);
    expect(report.config?.scope).toBe("spec-only");
    expect(verdict.metadata.scope).toBe("spec-only");
    expect(history.value[0]?.scope).toBe("spec-only");
  });

  it("9.21 no file holds a stray and the verdict holds no strykerCounts or mechanical counts", () => {
    const reportIds = Object.values(report.files).flatMap((f) => f.mutants.map((m) => m.id));
    const reportNames = Object.values(report.files).flatMap((f) =>
      f.mutants.map((m) => m.mutatorName),
    );
    const history = parseHistoryLines(historyText);
    const historyIds = history.ok ? (history.value[0]?.mutants.map((m) => m.id) ?? []) : [];
    expect(reportIds.length).toBeGreaterThan(0);
    expect(verdict.mutants.length).toBe(reportIds.length);
    expect(historyIds.length).toBe(reportIds.length);
    for (const id of [...reportIds, ...verdict.mutants.map((m) => m.id), ...historyIds]) {
      expect(id.startsWith("oath-"), id).toBe(true);
    }
    expect(reportNames.every((n) => n === "Oathbreaker")).toBe(true);
    expect(verdict.mutants.every((m) => m.species === "Oathbreaker")).toBe(true);
    expect("strykerCounts" in verdict).toBe(false);
    expect(verdict.mutantCounts?.mechanical).toBeUndefined();
    expect(verdictText).not.toContain("strykerCounts");
  });

  it("10.11 no string in the three files holds an absolute path", () => {
    const strings = [...collectStrings(report), ...collectStrings(verdict)];
    for (const line of historyText.split("\n").filter((l) => l !== "")) {
      strings.push(...collectStrings(JSON.parse(line) as unknown));
    }
    expect(strings.length).toBeGreaterThan(0);
    expect(strings.filter((s) => containsAbsolutePath(s))).toEqual([]);
  });

  it("9.18 git status shows no change in examples/pricing outside .trickortest", () => {
    const outside = (text: string): string[] =>
      text.split("\n").filter((line) => line !== "" && !line.includes(".trickortest/"));
    expect(outside(gitStatusAfter)).toEqual(outside(gitStatusBefore));
  });
});
