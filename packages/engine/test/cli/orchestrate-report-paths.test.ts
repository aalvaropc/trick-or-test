import { describe, expect, it } from "vitest";
import {
  type LoadedProject,
  type ReportAdapters,
  type ReportStageInput,
  writeReports,
} from "../../src/cli/orchestrate.js";
import { resolveConfigPaths } from "../../src/core/config.js";
import { containsAbsolutePath } from "../../src/core/paths.js";
import { err, ok } from "../../src/core/result.js";
import type {
  CriterionId,
  EngineConfig,
  MutantId,
  RunMetadata,
  SpecMutant,
} from "../../src/core/types.js";

const REPO = "/tmp/machine-specific/repo";
const ROOT = `${REPO}/examples/app`;
const fileNamed = (files: Map<string, string>, name: string): string => {
  const key = [...files.keys()].find((k) => k.endsWith(`/reports/${name}`));
  return key === undefined ? "" : (files.get(key) as string);
};
const written: EngineConfig = {
  specDir: "../../.kiro/specs",
  sourceGlobs: ["src/**/*.ts"],
  testGlobs: ["test/**/*.test.ts"],
  propertyTestGlobs: ["test/**/*.property.test.ts"],
  mutantsDir: "mutants",
  outputDir: "../../reports",
};
const project: LoadedProject = {
  config: resolveConfigPaths(written, ROOT),
  specs: [
    {
      name: "demo",
      requirementsPath: `${REPO}/.kiro/specs/demo/requirements.md`,
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
const input: ReportStageInput = {
  mechanical: [],
  specMutants: [
    {
      mutant: specMutant,
      result: {
        id: specMutant.id,
        species: "Oathbreaker",
        status: "Survived",
        requirement: specMutant.requirement,
        killingTests: [],
      },
    },
  ],
  ignoreStaticRetried: false,
  metadata,
};

const notApplicable: SpecMutant = {
  ...specMutant,
  id: "oath-1.1-missing-file" as MutantId,
  file: "src/missing.ts",
};
const noOutcome: SpecMutant = {
  ...specMutant,
  id: "oath-1.1-no-outcome" as MutantId,
};
const withRunTimePaths: ReportStageInput = {
  ...input,
  specMutants: [
    ...input.specMutants,
    {
      mutant: notApplicable,
      result: {
        id: notApplicable.id,
        species: "Oathbreaker",
        status: "NotApplicable",
        requirement: notApplicable.requirement,
        killingTests: [],
      },
      message: `ENOENT: no such file or directory, open '${ROOT}/src/missing.ts'`,
    },
    {
      mutant: noOutcome,
      result: {
        id: noOutcome.id,
        species: "Oathbreaker",
        status: "InvalidWitness",
        requirement: noOutcome.requirement,
        killingTests: [],
      },
      message: `witness produced no outcome, see ${REPO}/.trickortest/witness.log`,
    },
  ],
};

const stringsIn = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [k, ...stringsIn(v)]);
  }
  return [];
};

const run = async (stage: ReportStageInput = input) => {
  const files = new Map<string, string>([
    [`${ROOT}/src/f.ts`, "export const f = (a: number) => a < 10;\n"],
  ]);
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
  const result = await writeReports({ project: ROOT }, project, stage, { fs });
  expect(result.ok).toBe(true);
  return files;
};

describe("report paths", () => {
  it("8.17 the history record keeps the configuration relative to the project root", async () => {
    const files = await run();
    const line = fileNamed(files, "history.jsonl").trim();
    expect(line).not.toBe("");
    expect(line).not.toContain("\n");
    expect(JSON.parse(line).config).toEqual(written);
  });

  it("8.17 mutation-report.json, verdict.json and history.jsonl hold no absolute path", async () => {
    const files = await run();
    for (const name of ["mutation-report.json", "verdict.json", "history.jsonl"]) {
      const text = fileNamed(files, name);
      expect(text, name).not.toBe("");
      expect(text, name).not.toContain(REPO);
      expect(text, name).not.toMatch(/"\/|"[A-Za-z]:[\\/]/);
    }
  });

  it("8.17 a NotApplicable read error and a NoOutcome message with absolute paths leave no absolute path in any output", async () => {
    const files = await run(withRunTimePaths);
    for (const name of ["mutation-report.json", "verdict.json", "history.jsonl"]) {
      const text = fileNamed(files, name);
      expect(text, name).not.toBe("");
      if (name === "mutation-report.json") expect(text).toContain("open 'src/missing.ts'");
      expect(text, name).not.toContain(REPO);
      const strings = stringsIn(JSON.parse(name === "history.jsonl" ? text.trim() : text));
      expect(strings.length, name).toBeGreaterThan(0);
      for (const s of strings) expect(containsAbsolutePath(s), `${name}: ${s}`).toBe(false);
    }
  });
});
