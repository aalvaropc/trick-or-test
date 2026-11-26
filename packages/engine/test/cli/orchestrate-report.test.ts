import { describe, expect, it } from "vitest";
import {
  type LoadedProject,
  type MechanicalOutcome,
  type ReportAdapters,
  type ReportStageInput,
  type SpecMutantOutcome,
  writeReports,
} from "../../src/cli/orchestrate.js";
import { computeMutantId } from "../../src/core/mutant-id.js";
import { err, ok } from "../../src/core/result.js";
import type { CriterionId, MutantId, RunMetadata, SpecMutant } from "../../src/core/types.js";

const ROOT = "/proj";
const OUT = `${ROOT}/reports`;
const HISTORY = `${OUT}/history.jsonl`;
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
        { id: "1.1" as CriterionId, requirement: 1, criterion: 1, text: "a", line: 1 },
        { id: "1.2" as CriterionId, requirement: 1, criterion: 2, text: "b", line: 2 },
      ],
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

const specOutcome = (status: "Killed" | "Survived"): SpecMutantOutcome => ({
  mutant: specMutant,
  result: {
    id: specMutant.id,
    species: "Oathbreaker",
    status,
    requirement: specMutant.requirement,
    killingTests: status === "Killed" ? ["test/a.test.ts::example" as never] : [],
  },
});

const mechanicalOutcome: MechanicalOutcome = {
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

const input = (over: Partial<ReportStageInput> = {}): ReportStageInput => ({
  mechanical: [mechanicalOutcome],
  specMutants: [specOutcome("Survived")],
  ignoreStaticRetried: false,
  metadata,
  ...over,
});

const fakeFs = (initial: Record<string, string> = {}, failOn?: string) => {
  const files = new Map<string, string>(
    Object.entries({ [`${ROOT}/src/f.ts`]: SOURCE, ...initial }),
  );
  const fs: ReportAdapters["fs"] = {
    async readFile(path) {
      const text = files.get(path);
      return text === undefined ? err(`ENOENT ${path}`) : ok(text);
    },
    async exists(path) {
      return files.has(path);
    },
    async writeFile(path, content) {
      if (path === failOn) return err("EACCES");
      files.set(path, content);
      return ok(undefined);
    },
  };
  return { files, adapters: { fs } satisfies ReportAdapters };
};

const run = (fake: ReturnType<typeof fakeFs>, over: Partial<ReportStageInput> = {}) =>
  writeReports({ project: ROOT }, project, input(over), fake.adapters);

const historyLines = (fake: ReturnType<typeof fakeFs>): string[] =>
  (fake.files.get(HISTORY) ?? "").split("\n").slice(0, -1);

describe("writeReports", () => {
  it("writes the report, the verdict and the history", async () => {
    const fake = fakeFs();
    const result = await run(fake);
    expect(result.ok).toBe(true);
    for (const name of ["mutation-report.json", "verdict.json", "history.jsonl"]) {
      expect(fake.files.has(`${OUT}/${name}`)).toBe(true);
    }
    const verdict = JSON.parse(fake.files.get(`${OUT}/verdict.json`) as string);
    expect(verdict.coverage).toEqual([
      { criterion: "1.1", status: "unguarded", text: "a" },
      { criterion: "1.2", status: "unattacked", text: "b" },
    ]);
    const report = JSON.parse(fake.files.get(`${OUT}/mutation-report.json`) as string);
    const ids = report.files["src/f.ts"].mutants.map((m: { id: string }) => m.id);
    expect(ids).toContain("oath-1.1-boundary");
    expect(ids).toContain(mechanicalOutcome.result.id);
  });

  it("starts history.jsonl with one line on a first run", async () => {
    const fake = fakeFs();
    await run(fake);
    const lines = historyLines(fake);
    expect(lines).toHaveLength(1);
    expect(fake.files.get(HISTORY)?.endsWith("\n")).toBe(true);
  });

  it("adds exactly one line per later run and keeps earlier lines byte-identical", async () => {
    const fake = fakeFs();
    await run(fake);
    const first = historyLines(fake);
    await run(fake, { specMutants: [specOutcome("Killed")] });
    const second = historyLines(fake);
    expect(second).toHaveLength(2);
    expect(second[0]).toBe(first[0]);
    await run(fake);
    const third = historyLines(fake);
    expect(third).toHaveLength(3);
    expect(third.slice(0, 2)).toEqual(second);
    expect(JSON.parse(second[1] as string).newlyKilledIds).toEqual(["oath-1.1-boundary"]);
  });

  it("writes every history line as one JSON object", async () => {
    const fake = fakeFs();
    await run(fake);
    await run(fake);
    const text = fake.files.get(HISTORY) as string;
    expect(text.trimStart().startsWith("[")).toBe(false);
    for (const line of historyLines(fake)) {
      const parsed = JSON.parse(line);
      expect(Array.isArray(parsed)).toBe(false);
      expect(typeof parsed).toBe("object");
    }
  });

  it("returns an error naming the path and line for a corrupt history, and writes nothing", async () => {
    const fake = fakeFs();
    await run(fake);
    const good = fake.files.get(HISTORY) as string;
    fake.files.set(HISTORY, `${good}{not json\n`);
    const before = new Map(fake.files);
    const result = await run(fake);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("history-error");
    expect(result.error.message).toContain(HISTORY);
    expect(result.error.line).toBe(2);
    expect(result.error.message).toContain("line 2");
    expect(fake.files).toEqual(before);
  });

  it("names the path when a write fails", async () => {
    const verdictPath = `${OUT}/verdict.json`;
    const fake = fakeFs({}, verdictPath);
    const result = await run(fake);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("write-error");
    expect(result.error.path).toBe(verdictPath);
    expect(result.error.message).toContain(verdictPath);
  });

  it("writes identical report and verdict content for the same inputs, except the timestamp", async () => {
    const a = fakeFs();
    const b = fakeFs();
    await run(a);
    await run(b, { metadata: { ...metadata, timestamp: "2030-05-05T05:05:05.000Z" } });
    expect(a.files.get(`${OUT}/mutation-report.json`)).toBe(
      b.files.get(`${OUT}/mutation-report.json`),
    );
    const strip = (text: string | undefined): unknown => {
      const v = JSON.parse(text as string);
      v.metadata.timestamp = "";
      return v;
    };
    expect(strip(a.files.get(`${OUT}/verdict.json`))).toEqual(
      strip(b.files.get(`${OUT}/verdict.json`)),
    );
  });
});
