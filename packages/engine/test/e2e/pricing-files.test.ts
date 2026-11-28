import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { containsAbsolutePath } from "../../src/core/paths.js";
import { mutationReportSchema, parseHistoryLines, verdictSchema } from "../../src/core/report.js";
import type { HistoryRecord, Verdict } from "../../src/core/types.js";

// The three files written by a real run of the built CLI on examples/pricing, checked for
// agreement with each other, with a Vitest JSON run of the project and with the committed
// reports/verdict.json (Requirements 6.12, 8.21, 8.22, 8.23, 10.15, 11.12).
// Runs only through `npm run test:e2e --workspace trick-or-test`.

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const project = join(repoRoot, "examples", "pricing");
const cliPath = join(repoRoot, "packages", "engine", "dist", "cli", "main.js");
const vitestPath = join(repoRoot, "node_modules", "vitest", "vitest.mjs");
const scratchRoot = join(repoRoot, ".trickortest");

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const exec = (command: string, args: string[], cwd: string): Promise<Run> =>
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

const STATUSES = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
] as const;

const strings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      strings(item, out);
    }
  }
  return out;
};

const idSet = (ids: readonly string[]): string[] => [...new Set(ids)].sort();

describe("pricing files of a real run", () => {
  let scratch = "";
  let run: Run;
  let verdict: Verdict;
  let reportRaw: unknown;
  let verdictRaw: unknown;
  let historyText = "";
  let lastRecord: HistoryRecord | undefined;
  let reportMutants: { id: string; mutatorName: string }[] = [];
  let numPassedTests = -1;
  let committedClaimCounts: unknown;
  let specRequirements: number[] = [];

  beforeAll(async () => {
    const build = await exec("npm", ["run", "build", "--workspace", "trick-or-test"], repoRoot);
    expect(build.code, build.stdout + build.stderr).toBe(0);

    await mkdir(scratchRoot, { recursive: true });
    scratch = await mkdtemp(join(scratchRoot, "pricing-files-"));
    const outputDir = join(scratch, "out");

    run = await exec(
      process.execPath,
      [cliPath, "measure", "--project", project, "--spec", "cart-pricing", "--output", outputDir],
      repoRoot,
    );

    verdictRaw = JSON.parse(await readFile(join(outputDir, "verdict.json"), "utf8"));
    reportRaw = JSON.parse(await readFile(join(outputDir, "mutation-report.json"), "utf8"));
    historyText = await readFile(join(outputDir, "history.jsonl"), "utf8");
    verdict = verdictSchema.parse(verdictRaw) as Verdict;
    const report = mutationReportSchema.parse(reportRaw);
    reportMutants = Object.values(report.files).flatMap((f) => f.mutants);
    const history = parseHistoryLines(historyText);
    lastRecord = history.ok ? history.value.at(-1) : undefined;

    // A Vitest JSON run of the project, excluding what the engine's own baseline excludes.
    const vitestOut = join(scratch, "vitest.json");
    const vitest = await exec(
      process.execPath,
      [
        vitestPath,
        "run",
        "--reporter=json",
        `--outputFile=${vitestOut}`,
        "--exclude",
        ".trickortest/**",
        "--exclude",
        "**/*.witness.test.ts",
      ],
      project,
    );
    expect(vitest.code, vitest.stdout + vitest.stderr).toBe(0);
    const vitestJson = JSON.parse(await readFile(vitestOut, "utf8")) as {
      numPassedTests: number;
    };
    numPassedTests = vitestJson.numPassedTests;

    const committed = JSON.parse(await readFile(join(repoRoot, "reports", "verdict.json"), "utf8"));
    committedClaimCounts = (committed as { claimCounts?: unknown }).claimCounts;

    const requirements = await readFile(
      join(repoRoot, ".kiro", "specs", "cart-pricing", "requirements.md"),
      "utf8",
    );
    specRequirements = [...requirements.matchAll(/^### Requirement (\d+)\b/gm)].map((m) =>
      Number(m[1]),
    );
  }, 900_000);

  afterAll(async () => {
    if (scratch !== "") await rm(scratch, { recursive: true, force: true });
  });

  const isSpecInVerdict = (m: { species: string }): boolean => m.species === "Oathbreaker";

  it("10.15 the run exits with code 0", () => {
    expect(run.code, run.stderr).toBe(0);
  });

  it("8.17 the ids of verdict.json, mutation-report.json and the last history record are equal", () => {
    expect(lastRecord).toBeDefined();
    const fromVerdict = idSet(verdict.mutants.map((m) => m.id));
    expect(verdict.mutants).toHaveLength(fromVerdict.length);
    expect(idSet(reportMutants.map((m) => m.id))).toEqual(fromVerdict);
    expect(idSet((lastRecord?.mutants ?? []).map((m) => m.id))).toEqual(fromVerdict);
  });

  it("8.22 mutantCounts agrees with the mutants listed, per kind and status", () => {
    const counts = verdict.mutantCounts;
    expect(counts).toBeDefined();
    if (counts === undefined) return;
    const specIdsInReport = idSet(
      reportMutants.filter((m) => m.mutatorName === "Oathbreaker").map((m) => m.id),
    );
    expect(idSet(verdict.mutants.filter(isSpecInVerdict).map((m) => m.id))).toEqual(
      specIdsInReport,
    );
    for (const status of STATUSES) {
      const spec = verdict.mutants.filter((m) => isSpecInVerdict(m) && m.status === status);
      const mech = verdict.mutants.filter((m) => !isSpecInVerdict(m) && m.status === status);
      expect(counts.spec[status], `mutantCounts.spec.${status}`).toBe(spec.length);
      expect(counts.mechanical?.[status] ?? 0, `mutantCounts.mechanical.${status}`).toBe(
        mech.length,
      );
    }
  });

  it("8.23 twinsMerged plus the mechanical mutants equals strykerCounts.total, and detected and undetected stay within it", () => {
    const stryker = verdict.strykerCounts;
    expect(stryker).toBeDefined();
    if (stryker === undefined || verdict.mutantCounts === undefined) return;
    const mechanical = verdict.mutants.filter((m) => !isSpecInVerdict(m)).length;
    expect(verdict.mutantCounts.twinsMerged + mechanical).toBe(stryker.total);
    expect(stryker.detected).toBeLessThanOrEqual(stryker.total);
    expect(stryker.undetected).toBeLessThanOrEqual(stryker.total);
  });

  it("6.12 baselineTests has one entry for each passed test of a Vitest JSON run of the project", () => {
    expect(numPassedTests).toBeGreaterThan(0);
    expect(verdict.baselineTests?.length).toBe(numPassedTests);
  });

  it("6.13 every killing test of every mutant is a baseline test, except a file-level failure", () => {
    const baseline = new Set((verdict.baselineTests ?? []).map((t) => t.id as string));
    expect(baseline.size).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const m of verdict.mutants) {
      for (const t of m.killingTests) {
        if (t.includes("::") && !baseline.has(t)) missing.push(`${m.id}: ${t}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("6.15 no killing test is outside baselineTests (unmatchedKillingTests is 0)", () => {
    expect(verdict.unmatchedKillingTests).toBe(0);
  });

  it("11.12 claimCounts adds up and agrees with the claims of baselineTests", () => {
    const cc = verdict.claimCounts;
    expect(cc).toBeDefined();
    if (cc === undefined) return;
    const claims = (verdict.baselineTests ?? []).flatMap((t) => t.claims ?? []);
    const count = (outcome: string): number => claims.filter((c) => c.outcome === outcome).length;
    expect(cc.held + cc.notHeld + cc.unchecked + cc.unknownCriterion).toBe(cc.total);
    expect(cc.total).toBe(claims.length);
    expect(cc.held).toBe(count("held"));
    expect(cc.notHeld).toBe(count("not-held"));
    expect(cc.unchecked).toBe(count("unchecked"));
    expect(cc.unknownCriterion).toBe(count("unknown-criterion"));
    expect(cc.notHeldOthersKilledAll + cc.notHeldOthersDidNot).toBe(cc.notHeld);
  });

  it("11.12 the claim numbers equal those of the committed reports/verdict.json", () => {
    expect(committedClaimCounts).toBeDefined();
    expect(verdict.claimCounts).toEqual(committedClaimCounts);
  });

  it("8.21 the last history record carries the coverage of verdict.json", () => {
    const expected = verdict.coverage.map((c) => ({ criterion: c.criterion, status: c.status }));
    expect(lastRecord?.coverageByCriterion).toEqual(expected);
  });

  it("8.21 the metadata names the spec, the scope is full or absent, and requirements match the spec", () => {
    expect(verdict.metadata.specName).toBe("cart-pricing");
    expect([undefined, "full"]).toContain(verdict.metadata.scope);
    expect(specRequirements.length).toBeGreaterThan(0);
    expect((verdict.requirements ?? []).map((r) => r.requirement)).toEqual(specRequirements);
  });

  it("8.17 no string in the three files holds an absolute path", () => {
    const history = historyText
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as unknown);
    const all = [...strings(verdictRaw), ...strings(reportRaw), ...strings(history)];
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((s) => containsAbsolutePath(s))).toEqual([]);
  });
});
