import { describe, expect, it } from "vitest";
import {
  buildHistoryRecord,
  buildMutationReport,
  buildVerdict,
  type MutantChange,
  type ReportMutantInput,
  type SpecReportMutantInput,
} from "../../src/core/report.js";
import type {
  CriterionId,
  EngineConfig,
  MutantId,
  MutantResult,
  MutantStatus,
  RunMetadata,
} from "../../src/core/types.js";

const mid = (s: string) => s as MutantId;
const cid = (s: string) => s as CriterionId;
const ROOT = "/proj";

const metadata: RunMetadata = {
  gitCommit: "abc123",
  seed: 42,
  engineVersion: "0.1.0",
  nodeVersion: "22.0.0",
  strykerVersion: "9.0.0",
  vitestVersion: "3.0.0",
  typescriptVersion: "5.6.0",
  timestamp: "2025-01-01T00:00:00.000Z",
};

const config: EngineConfig = {
  specDir: "specs",
  sourceGlobs: ["src/**/*.ts"],
  testGlobs: ["test/**/*.test.ts"],
  propertyTestGlobs: ["test/**/*.property.test.ts"],
  mutantsDir: "mutants",
  outputDir: ".trickortest",
};

const at = (line: number) => ({
  start: { line, column: 1 },
  end: { line, column: 5 },
});

type Raw = {
  id: string;
  kind: "spec" | "mechanical";
  status: MutantStatus;
  line: number;
  replacement: string;
};

// m1 and m2 are plain Mechanical_Mutants. "twin" makes the same change as "oath".
const rawWithTwin: Raw[] = [
  { id: "m1", kind: "mechanical", status: "Killed", line: 1, replacement: "a" },
  { id: "m2", kind: "mechanical", status: "Survived", line: 2, replacement: "b" },
  { id: "twin", kind: "mechanical", status: "Killed", line: 3, replacement: "c" },
  { id: "oath", kind: "spec", status: "Survived", line: 3, replacement: "c" },
];
const rawWithoutTwin: Raw[] = rawWithTwin.map((r) =>
  r.id === "twin" ? { ...r, replacement: "different" } : r,
);

const build = (raw: Raw[]) => {
  const mechanical: ReportMutantInput[] = raw
    .filter((r) => r.kind === "mechanical")
    .map((r) => ({
      id: mid(r.id),
      file: "src/a.ts",
      location: at(r.line),
      replacement: r.replacement,
      status: r.status,
    }));
  const spec: SpecReportMutantInput[] = raw
    .filter((r) => r.kind === "spec")
    .map((r) => ({
      id: mid(r.id),
      file: "src/a.ts",
      location: at(r.line),
      replacement: r.replacement,
      status: r.status,
      requirement: cid("1.1"),
    }));
  const report = buildMutationReport({
    files: { "src/a.ts": { language: "typescript", source: "" } },
    mechanical,
    spec,
    projectRoot: ROOT,
  });
  const results: MutantResult[] = raw.map((r) => ({
    id: mid(r.id),
    species: r.kind === "spec" ? "Oathbreaker" : "Borderling",
    status: r.status,
    ...(r.kind === "spec" ? { requirement: cid("1.1") } : {}),
    killingTests: [],
    ...(r.status === "Killed" ? { killClass: "both" as const } : {}),
  }));
  const changes: Record<MutantId, MutantChange> = Object.fromEntries(
    raw.map((r) => [
      mid(r.id),
      { file: "src/a.ts", location: at(r.line), replacement: r.replacement },
    ]),
  );
  const verdictResult = buildVerdict({
    coverage: [],
    mutants: results,
    witnesses: {},
    ignoreStaticRetried: false,
    metadata,
    projectRoot: ROOT,
    changes,
  });
  if (!verdictResult.ok) throw new Error(verdictResult.error);
  const historyResult = buildHistoryRecord(verdictResult.value, undefined, config, ROOT, changes);
  if (!historyResult.ok) throw new Error(historyResult.error);
  return { report, verdict: verdictResult.value, history: historyResult.value };
};

const sorted = (ids: string[]): string[] => [...ids].sort();
const sum = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((a, b) => a + b, 0);

describe("one list of mutants for the three builders", () => {
  it("8.21 the three outputs list the same ids and none lists the Twin", () => {
    const { report, verdict, history } = build(rawWithTwin);
    const inReport = Object.values(report.files).flatMap((f) => f.mutants.map((m) => m.id));
    const inVerdict = verdict.mutants.map((m) => m.id as string);
    const inHistory = history.mutants.map((m) => m.id as string);
    expect(sorted(inReport)).toEqual(["m1", "m2", "oath"]);
    expect(sorted(inVerdict)).toEqual(["m1", "m2", "oath"]);
    expect(sorted(inHistory)).toEqual(["m1", "m2", "oath"]);
  });

  it("8.22 twinsMerged is 1 when the input has one Twin", () => {
    expect(build(rawWithTwin).verdict.mutantCounts?.twinsMerged).toBe(1);
  });

  it("8.22 mutantCounts counts the listed mutants per kind and status", () => {
    const counts = build(rawWithTwin).verdict.mutantCounts;
    expect(counts?.spec.Survived).toBe(1);
    expect(sum(counts?.spec ?? {})).toBe(1);
    expect(counts?.mechanical?.Killed).toBe(1);
    expect(counts?.mechanical?.Survived).toBe(1);
    expect(sum(counts?.mechanical ?? {})).toBe(2);
  });

  it("8.23 strykerCounts.total is one more than the mechanical mutants in mutantCounts", () => {
    const { verdict } = build(rawWithTwin);
    expect(sum(verdict.mutantCounts?.mechanical ?? {})).toBe(2);
    expect(verdict.strykerCounts?.total).toBe(3);
  });

  it("8.23 a Twin that StrykerJS killed counts in detected and not in mutantCounts", () => {
    const { verdict } = build(rawWithTwin);
    expect(verdict.strykerCounts?.detected).toBe(2);
    expect(verdict.strykerCounts?.undetected).toBe(1);
    expect(verdict.mutantCounts?.mechanical?.Killed).toBe(1);
  });

  it("8.22 an input without Twins gives twinsMerged 0 and equal totals", () => {
    const { verdict } = build(rawWithoutTwin);
    expect(verdict.mutantCounts?.twinsMerged).toBe(0);
    expect(sum(verdict.mutantCounts?.mechanical ?? {})).toBe(3);
    expect(verdict.strykerCounts?.total).toBe(3);
    expect(verdict.mutants).toHaveLength(4);
  });
});
