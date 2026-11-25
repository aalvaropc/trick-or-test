import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import { schema } from "mutation-testing-report-schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { containsAbsolutePath } from "../../src/core/paths.js";
import {
  historyRecordSchema,
  mutationReportSchema,
  parseHistoryLines,
  verdictSchema,
} from "../../src/core/report.js";
import type { HistoryRecord, Verdict } from "../../src/core/types.js";

// End-to-end run of the built CLI against examples/pricing with real StrykerJS and Vitest.
// Runs only through `npm run test:e2e --workspace trick-or-test`.

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const project = join(repoRoot, "examples", "pricing");
const cliPath = join(repoRoot, "packages", "engine", "dist", "cli", "main.js");
const mutantsDir = join(project, "mutants", "cart-pricing");
const sandboxesDir = join(project, ".trickortest", "sandboxes");

interface CliRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const exec = (command: string, args: string[], cwd: string): Promise<CliRun> =>
  new Promise((done) => {
    execFile(
      command,
      args,
      { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : Number.NaN;
        done({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });

const listFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)))
    .sort();
};

const hashTree = async (dir: string): Promise<string> => {
  const hash = createHash("sha256");
  for (const file of await listFiles(dir)) {
    hash.update(`${file}\0`);
    hash.update(await readFile(join(dir, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
};

const strykerTmpDir = join(project, ".trickortest", "stryker-tmp");

const treeSize = async (dir: string): Promise<number> => {
  if (!existsSync(dir)) return 0;
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  let total = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    total += (await lstat(join(entry.parentPath, entry.name))).size;
  }
  return total;
};

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

describe("pricing end-to-end", () => {
  let gitStatusBefore = "";
  let gitStatusAfter = "";
  let strykerTmpSizeAfterFirst = 0;
  let strykerTmpSizeAfterSecond = 0;
  let outputDir = "";
  let srcBefore = "";
  let testBefore = "";
  let srcAfter = "";
  let testAfter = "";
  let first: CliRun;
  let second: CliRun;
  let historyAfterFirst = "";
  let historyAfterSecond = "";
  let verdict: Verdict;
  let report: unknown;
  let expectedMutantIds: string[] = [];

  beforeAll(async () => {
    const build = await exec("npm", ["run", "build", "--workspace", "trick-or-test"], repoRoot);
    expect(build.code, build.stdout + build.stderr).toBe(0);

    expectedMutantIds = (await readdir(mutantsDir))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();

    outputDir = await mkdtemp(join(tmpdir(), "trick-or-test-e2e-"));
    srcBefore = await hashTree(join(project, "src"));
    testBefore = await hashTree(join(project, "test"));

    const args = [
      cliPath,
      "measure",
      "--project",
      project,
      "--spec",
      "cart-pricing",
      "--output",
      outputDir,
    ];
    gitStatusBefore = (await exec("git", ["status", "--porcelain", "examples/pricing"], repoRoot))
      .stdout;
    first = await exec(process.execPath, args, repoRoot);
    strykerTmpSizeAfterFirst = await treeSize(strykerTmpDir);
    historyAfterFirst = existsSync(join(outputDir, "history.jsonl"))
      ? await readFile(join(outputDir, "history.jsonl"), "utf8")
      : "";
    second = await exec(process.execPath, args, repoRoot);
    historyAfterSecond = existsSync(join(outputDir, "history.jsonl"))
      ? await readFile(join(outputDir, "history.jsonl"), "utf8")
      : "";

    strykerTmpSizeAfterSecond = await treeSize(strykerTmpDir);
    gitStatusAfter = (await exec("git", ["status", "--porcelain", "examples/pricing"], repoRoot))
      .stdout;

    srcAfter = await hashTree(join(project, "src"));
    testAfter = await hashTree(join(project, "test"));

    verdict = JSON.parse(await readFile(join(outputDir, "verdict.json"), "utf8")) as Verdict;
    report = JSON.parse(await readFile(join(outputDir, "mutation-report.json"), "utf8"));
  }, 900_000);

  afterAll(async () => {
    if (outputDir !== "") await rm(outputDir, { recursive: true, force: true });
  });

  it("10.8 both runs exit with code 0", () => {
    expect(first.code, first.stderr).toBe(0);
    expect(second.code, second.stderr).toBe(0);
  });

  it("10.8 the mutation report validates against mutation-testing-report-schema", () => {
    const validate = new Ajv({ strict: false }).compile(schema);
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    expect(mutationReportSchema.safeParse(report).success).toBe(true);
  });

  it("10.8 verdict.json matches the verdict schema", () => {
    expect(verdictSchema.safeParse(verdict).success).toBe(true);
  });

  it("10.8 history.jsonl parses and every record matches the history schema", () => {
    const parsed = parseHistoryLines(historyAfterSecond);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    for (const record of parsed.value) {
      expect(historyRecordSchema.safeParse(record).success).toBe(true);
    }
  });

  it("10.8 a second run appends exactly one history record and keeps earlier lines byte-identical", () => {
    const firstParsed = parseHistoryLines(historyAfterFirst);
    const secondParsed = parseHistoryLines(historyAfterSecond);
    expect(firstParsed.ok && firstParsed.value.length).toBe(1);
    expect(secondParsed.ok && secondParsed.value.length).toBe(2);
    expect(historyAfterSecond.startsWith(historyAfterFirst)).toBe(true);
    const appended = historyAfterSecond.slice(historyAfterFirst.length);
    expect(appended.endsWith("\n")).toBe(true);
    expect(appended.trimEnd().includes("\n")).toBe(false);
    const record: HistoryRecord | undefined = secondParsed.ok ? secondParsed.value[1] : undefined;
    expect(record).toBeDefined();
  });

  it("10.9 examples/pricing/src and test are byte-identical after the runs", () => {
    expect(srcAfter).toBe(srcBefore);
    expect(testAfter).toBe(testBefore);
  });

  it("10.9 .trickortest/sandboxes is empty or absent after the runs", async () => {
    if (!existsSync(sandboxesDir)) return;
    expect(await readdir(sandboxesDir)).toEqual([]);
  });

  it("10.9 git status shows no change in examples/pricing outside .trickortest", () => {
    const outside = (text: string): string[] =>
      text.split("\n").filter((line) => line !== "" && !line.includes(".trickortest/"));
    expect(outside(gitStatusAfter)).toEqual(outside(gitStatusBefore));
  });

  it("10.11 no string in the report, verdict or history holds an absolute path", () => {
    const history = historyAfterSecond
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as unknown);
    const strings = [...collectStrings(report), ...collectStrings(verdict)];
    for (const record of history) strings.push(...collectStrings(record));
    expect(strings.length).toBeGreaterThan(0);
    const offending = strings.filter((s) => containsAbsolutePath(s));
    expect(offending).toEqual([]);
  });

  it("10.11 .trickortest/stryker-tmp is not larger after the second run than after the first", () => {
    expect(strykerTmpSizeAfterSecond).toBeLessThanOrEqual(strykerTmpSizeAfterFirst);
  });

  it("10.10 all 24 spec mutants are present and valid", () => {
    expect(expectedMutantIds).toHaveLength(24);
    const invalid = new Set(["Ghost", "InvalidWitness", "CompileError", "NotApplicable"]);
    for (const id of expectedMutantIds) {
      const result = verdict.mutants.find((m) => m.id === id);
      expect(result, `${id} missing from verdict.json`).toBeDefined();
      expect(invalid.has(result?.status ?? ""), `${id} is ${result?.status}`).toBe(false);
    }
  });

  it("10.10 oath-7.4-negative-discount-allowed survives and criterion 7.4 is unguarded", () => {
    const result = verdict.mutants.find((m) => m.id === "oath-7.4-negative-discount-allowed");
    expect(result?.status).toBe("Survived");
    expect(verdict.coverage.find((c) => c.criterion === "7.4")?.status).toBe("unguarded");
  });

  it("10.10 the other 23 spec mutants are Killed", () => {
    const others = expectedMutantIds.filter((id) => id !== "oath-7.4-negative-discount-allowed");
    expect(others).toHaveLength(23);
    for (const id of others) {
      expect(verdict.mutants.find((m) => m.id === id)?.status, id).toBe("Killed");
    }
  });
});
