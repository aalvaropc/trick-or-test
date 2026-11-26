import { describe, expect, it } from "vitest";
import {
  type LoadedProject,
  type MechanicalOutcome,
  type ReportAdapters,
  type SpecMutantOutcome,
  writeReports,
} from "../../src/cli/orchestrate.js";
import { computeMutantId } from "../../src/core/mutant-id.js";
import { historyRecordSchema, mutationReportSchema, verdictSchema } from "../../src/core/report.js";
import { err, ok } from "../../src/core/result.js";
import type { CriterionId, MutantId, RunMetadata, SpecMutant } from "../../src/core/types.js";

const ROOT = "/proj";
const OUT = `${ROOT}/reports`;
const SOURCE = "export const f = (a: number) => a < 10;\n";

const project: LoadedProject = {
  config: {
    specDir: `${ROOT}/.kiro/specs`,
    sourceGlobs: ["src/**/*.ts"],
    testGlobs: ["test/**/*.test.ts"],
    propertyTestGlobs: ["test/**/*.property.test.ts"],
    mutantsDir: `${ROOT}/mutants`,
    outputDir: OUT,
  },
  specs: [
    {
      name: "demo",
      requirementsPath: `${ROOT}/.kiro/specs/demo/requirements.md`,
      criteria: [{ id: "1.1" as CriterionId, requirement: 1, criterion: 1, text: "a", line: 1 }],
      mutants: [],
      skipEntries: [],
    },
  ],
};

const specMutant: SpecMutant = {
  id: "oath-1.1-boundary" as MutantId,
  requirement: "1.1" as CriterionId,
  file: "src/f.ts",
  original: "a < 10",
  mutated: "a <= 10",
  why: "boundary",
  witness: { from: "src/f.ts", export: "f", args: [10], expected: false },
};

const specOutcome: SpecMutantOutcome = {
  mutant: specMutant,
  result: {
    id: specMutant.id,
    species: "Oathbreaker",
    status: "Survived",
    requirement: specMutant.requirement,
    killingTests: [],
  },
};

// Makes the same change as the Spec_Mutant: same file, span and replacement.
const twin: MechanicalOutcome = {
  result: {
    id: computeMutantId("src/f.ts", "a < 10", "a <= 10", 0),
    species: "Borderling",
    status: "Killed",
    killingTests: ["test/f.test.ts::kills" as never],
    killClass: "examples-only",
  },
  file: "src/f.ts",
  mutatorName: "EqualityOperator",
  original: "a < 10",
  replacement: "a <= 10",
  startLine: 1,
  endLine: 1,
  location: { start: { line: 1, column: 33 }, end: { line: 1, column: 39 } },
};

const stray: MechanicalOutcome = {
  result: {
    id: computeMutantId("src/f.ts", "<", ">", 0),
    species: "Borderling",
    status: "Survived",
    killingTests: [],
  },
  file: "src/f.ts",
  mutatorName: "EqualityOperator",
  original: "<",
  replacement: ">",
  startLine: 1,
  endLine: 1,
  location: { start: { line: 1, column: 35 }, end: { line: 1, column: 36 } },
};

const metadata: RunMetadata = {
  gitCommit: "abc",
  seed: 1,
  engineVersion: "0.0.0",
  nodeVersion: "v24",
  strykerVersion: "10.1.1",
  vitestVersion: "5.1.0",
  typescriptVersion: "7.0.2",
  timestamp: "2026-01-01T00:00:00.000Z",
};

const writeAll = async () => {
  const files = new Map<string, string>([[`${ROOT}/src/f.ts`, SOURCE]]);
  const fs: ReportAdapters["fs"] = {
    async readFile(path) {
      const text = files.get(path);
      return text === undefined ? err(`ENOENT ${path}`) : ok(text);
    },
    async exists(path) {
      return files.has(path);
    },
    async writeFile(path, content) {
      files.set(path, content);
      return ok(undefined);
    },
  };
  const result = await writeReports(
    { project: ROOT },
    project,
    {
      mechanical: [twin, stray],
      specMutants: [specOutcome],
      ignoreStaticRetried: false,
      metadata,
    },
    { fs },
  );
  expect(result.ok).toBe(true);
  const read = (name: string): string => files.get(`${OUT}/${name}`) as string;
  const verdict = verdictSchema.parse(JSON.parse(read("verdict.json")));
  const report = mutationReportSchema.parse(JSON.parse(read("mutation-report.json")));
  const history = historyRecordSchema.parse(JSON.parse(read("history.jsonl").trim()));
  return { verdict, report, history };
};

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

describe("writeReports totals", () => {
  it("8.21 the three files list the same set of mutant ids, without the Twin", async () => {
    const { verdict, report, history } = await writeAll();
    const expected = sorted([specMutant.id, stray.result.id]);
    expect(sorted(verdict.mutants.map((m) => m.id))).toEqual(expected);
    expect(sorted(Object.values(report.files).flatMap((f) => f.mutants.map((m) => m.id)))).toEqual(
      expected,
    );
    expect(sorted(history.mutants.map((m) => m.id))).toEqual(expected);
  });

  it("8.22 mutantCounts agrees with the ids listed and counts the merged Twin", async () => {
    const { verdict } = await writeAll();
    const counts = verdict.mutantCounts;
    expect(counts?.twinsMerged).toBe(1);
    expect(counts?.spec).toEqual({
      Killed: 0,
      Survived: 1,
      Timeout: 0,
      Ghost: 0,
      InvalidWitness: 0,
      CompileError: 0,
      NotApplicable: 0,
    });
    expect(counts?.mechanical).toEqual({
      Killed: 0,
      Survived: 1,
      Timeout: 0,
      Ghost: 0,
      InvalidWitness: 0,
      CompileError: 0,
      NotApplicable: 0,
    });
  });

  it("8.23 strykerCounts counts the Twin that the lists leave out", async () => {
    const { verdict } = await writeAll();
    expect(verdict.strykerCounts).toEqual({ detected: 1, undetected: 1, total: 2 });
  });

  it("10.13 the history record counts the same mutants as the verdict", async () => {
    const { history } = await writeAll();
    expect(history.statusCounts.Survived).toBe(2);
    expect(history.statusCounts.Killed).toBe(0);
  });
});
