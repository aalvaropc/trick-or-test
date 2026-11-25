import { describe, expect, it } from "vitest";
import { computeHeadlineCounts } from "../../src/bestiary/counts.js";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import { buildRunModel, type RunModel } from "../../src/loader/run-model.js";
import type { ParsedFile, RawRun } from "../../src/loader/types.js";
import { buildRows, COLUMNS } from "../../src/plain-view/columns.js";
import { readFixture } from "../fixtures/load.js";

const parsed = (kind: "mutation-report" | "verdict", name: string): ParsedFile => {
  const r = parseFile(kind, readFixture(name), name);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

const rawRun = (): RawRun => {
  const r = joinRun([parsed("mutation-report", "report.json"), parsed("verdict", "verdict.json")]);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

/** Rebuilds the fixture run with the report status of mutant `id` replaced. */
const withStatus = (id: string, status: string, statusReason?: string): RunModel => {
  const raw = rawRun();
  const files = Object.fromEntries(
    Object.entries(raw.report.files).map(([name, file]) => [
      name,
      {
        ...file,
        mutants: file.mutants.map((m) => {
          if (m.id !== id) return m;
          const { statusReason: _drop, ...rest } = m;
          return { ...rest, status, ...(statusReason === undefined ? {} : { statusReason }) };
        }),
      },
    ]),
  );
  return buildRunModel({
    ...raw,
    report: { ...raw.report, files } as unknown as RawRun["report"],
  });
};

const row = (model: RunModel, id: string) => {
  const found = buildRows(model).find((r) => r.mutantId === id);
  if (found === undefined) throw new Error(`no row ${id}`);
  return found;
};

describe("plain view rows", () => {
  it("9.2 builds one row per Mutant", () => {
    const model = buildRunModel(rawRun());
    const rows = buildRows(model);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.mutantId)).toEqual(model.mutants.map((m) => m.id));
  });

  it("9.2 offers the eight columns in order", () => {
    expect(COLUMNS.map((c) => c.id)).toEqual([
      "id",
      "species",
      "state",
      "status",
      "requirement",
      "file",
      "line",
      "killClass",
    ]);
    expect(COLUMNS.map((c) => c.label)).toEqual([
      "Mutant",
      "Species",
      "State",
      "Status",
      "Criterion",
      "File",
      "Line",
      "Kill class",
    ]);
  });

  it("9.2 fills a row from the Mutant", () => {
    const model = buildRunModel(rawRun());
    expect(row(model, "m7")).toEqual({
      mutantId: "m7",
      species: "Oathbreaker",
      stateLabel: "killed by t1",
      status: "Killed",
      requirement: "1.2",
      file: "src/price.ts",
      line: 1,
      killClass: "both",
    });
    expect(row(model, "m6").line).toBe(2);
    expect(row(model, "m1").requirement).toBeUndefined();
    expect(row(model, "m1").killClass).toBeUndefined();
  });

  it("9.2 column accessors return the row values", () => {
    const model = buildRunModel(rawRun());
    const r = row(model, "m2");
    const values = COLUMNS.map((c) => c.accessor(r));
    expect(values).toEqual([
      "m2",
      "Borderling",
      "killed by t1",
      "Killed",
      undefined,
      "src/price.ts",
      2,
      "examples-only",
    ]);
  });

  it("9.2 column comparators order strings and numbers, with missing values last", () => {
    const model = buildRunModel(rawRun());
    const byId = (id: string) => COLUMNS.find((c) => c.id === id)!;
    expect(byId("id").compare(row(model, "m1"), row(model, "m2"))).toBeLessThan(0);
    expect(byId("id").compare(row(model, "m2"), row(model, "m1"))).toBeGreaterThan(0);
    expect(byId("id").compare(row(model, "m1"), row(model, "m1"))).toBe(0);
    expect(byId("line").compare(row(model, "m1"), row(model, "m2"))).toBeLessThan(0);
    expect(byId("requirement").compare(row(model, "m7"), row(model, "m1"))).toBeLessThan(0);
    expect(byId("killClass").compare(row(model, "m1"), row(model, "m2"))).toBeGreaterThan(0);
  });

  it("9.6 labels states in plain words", () => {
    const model = buildRunModel(rawRun());
    expect(row(model, "m1").stateLabel).toBe("survived");
    expect(row(model, "m4").stateLabel).toBe("no test runs this code");
    expect(row(model, "m5").stateLabel).toBe("ghost, not counted");
  });

  it("4.8 labels an unrecognised status as not counted and keeps the row", () => {
    const model = withStatus("m3", "CompileError");
    expect(buildRows(model)).toHaveLength(7);
    expect(row(model, "m3").stateLabel).toBe("not counted");
    expect(row(model, "m3").status).toBe("CompileError");
  });

  it("9.6 labels Ignored without Ghost as not counted", () => {
    const model = withStatus("m3", "Ignored", "Engine status: InvalidWitness");
    expect(row(model, "m3").stateLabel).toBe("not counted");
  });

  it("9.6 labels Ignored with Ghost as ghost", () => {
    const model = withStatus("m3", "Ignored", "Engine status: Ghost");
    expect(row(model, "m3").stateLabel).toBe("ghost, not counted");
  });

  it("4.11 state counts per state equal the headline counts on the fixture", () => {
    const model = buildRunModel(rawRun());
    const headline = computeHeadlineCounts(model);
    const specRows = buildRows(model).filter((r) => r.requirement !== undefined);
    expect(specRows.filter((r) => r.stateLabel === "survived")).toHaveLength(
      headline.survivingSpecMutants,
    );
    expect(specRows.filter((r) => r.stateLabel.startsWith("killed"))).toHaveLength(
      headline.killedSpecMutants,
    );
    expect(headline.survivingSpecMutants).toBe(1);
    expect(headline.killedSpecMutants).toBe(1);
  });
});
