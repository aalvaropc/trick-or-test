import { describe, expect, it } from "vitest";
import {
  type LoadedProject,
  type ReportAdapters,
  type SpecMutantOutcome,
  writeReports,
} from "../../src/cli/orchestrate.js";
import { verdictSchema } from "../../src/core/report.js";
import { err, ok } from "../../src/core/result.js";
import type {
  CriterionId,
  MutantId,
  MutantStatus,
  RunMetadata,
  SpecMutant,
} from "../../src/core/types.js";
import type { WitnessOutcome } from "../../src/core/witness-compare.js";

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
      criteria: [
        {
          id: "1.1" as CriterionId,
          requirement: 1,
          criterion: 1,
          text: "WHEN the amount is 10 THE system SHALL reject it",
          line: 1,
        },
        {
          id: "1.2" as CriterionId,
          requirement: 1,
          criterion: 2,
          text: "THE system SHALL accept 9",
          line: 2,
        },
        {
          id: "1.3" as CriterionId,
          requirement: 1,
          criterion: 3,
          text: "THE system SHALL never throw",
          line: 3,
        },
      ],
      mutants: [],
      skipEntries: [],
    },
  ],
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

const value = (v: unknown): WitnessOutcome => ({ kind: "value", value: v });

const outcome = (
  id: string,
  status: MutantStatus,
  criterion: string,
  mutatedOutcome?: WitnessOutcome,
): SpecMutantOutcome => {
  const mutant: SpecMutant = {
    id: id as MutantId,
    requirement: criterion as CriterionId,
    file: "src/f.ts",
    original: "a < 10",
    mutated: "a <= 10",
    why: "boundary",
    witness: { from: "src/f.ts", export: "f", args: [10], expected: false },
  };
  return {
    mutant,
    result: {
      id: mutant.id,
      species: "Oathbreaker",
      status,
      requirement: mutant.requirement,
      killingTests: [],
    },
    ...(mutatedOutcome === undefined ? {} : { mutatedOutcome }),
  };
};

const writeAndParse = async (specMutants: SpecMutantOutcome[]) => {
  const files = new Map<string, string>([[`${ROOT}/src/f.ts`, SOURCE]]);
  const adapters: ReportAdapters = {
    fs: {
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
    },
  };
  const result = await writeReports(
    { project: ROOT },
    project,
    { mechanical: [], specMutants, ignoreStaticRetried: false, metadata },
    adapters,
  );
  expect(result.ok).toBe(true);
  return verdictSchema.parse(JSON.parse(files.get(`${OUT}/verdict.json`) as string));
};

describe("verdict fields written by the pipeline", () => {
  it("8.18 every criterion of the parsed spec has its text in verdict.json", async () => {
    const verdict = await writeAndParse([outcome("oath-1.1-a", "Survived", "1.1", value(true))]);
    const texts = Object.fromEntries(verdict.coverage.map((c) => [c.criterion, c.text]));
    expect(texts).toEqual({
      "1.1": "WHEN the amount is 10 THE system SHALL reject it",
      "1.2": "THE system SHALL accept 9",
      "1.3": "THE system SHALL never throw",
    });
  });

  it("8.19 a Survived, a Killed and a Ghost mutant keep the mutated outcome", async () => {
    const timeout: WitnessOutcome = { kind: "timeout", message: "witness exceeded 10 ms" };
    const verdict = await writeAndParse([
      outcome("oath-1.1-survived", "Survived", "1.1", value(true)),
      outcome("oath-1.1-killed", "Killed", "1.1", timeout),
      outcome("oath-1.1-ghost", "Ghost", "1.1", value(false)),
    ]);
    const w = verdict.witnesses;
    expect(w["oath-1.1-survived" as MutantId]?.mutatedOutcome).toEqual(value(true));
    expect(w["oath-1.1-killed" as MutantId]?.mutatedOutcome).toEqual(timeout);
    expect(w["oath-1.1-ghost" as MutantId]?.mutatedOutcome).toEqual(value(false));
  });

  it("8.19 an InvalidWitness and a CompileError mutant have no mutated outcome", async () => {
    const verdict = await writeAndParse([
      outcome("oath-1.1-invalid", "InvalidWitness", "1.1"),
      outcome("oath-1.1-compile", "CompileError", "1.1"),
    ]);
    for (const id of ["oath-1.1-invalid", "oath-1.1-compile"]) {
      const witness = verdict.witnesses[id as MutantId];
      expect(witness).toBeDefined();
      expect(Object.hasOwn(witness as object, "mutatedOutcome")).toBe(false);
    }
  });

  it("10.13 the written verdict.json parses with the zod schema and keeps the witness", async () => {
    const verdict = await writeAndParse([outcome("oath-1.1-a", "Survived", "1.1", value(true))]);
    expect(verdict.witnesses["oath-1.1-a" as MutantId]).toMatchObject({
      from: "src/f.ts",
      export: "f",
      expected: false,
    });
  });
});
