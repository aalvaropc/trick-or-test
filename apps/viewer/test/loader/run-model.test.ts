import { describe, expect, it } from "vitest";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import { buildRunModel } from "../../src/loader/run-model.js";
import type { ParsedFile, RawRun } from "../../src/loader/types.js";
import { readFixture } from "../fixtures/load.js";

const parsed = (kind: "mutation-report" | "verdict", name: string): ParsedFile => {
  const r = parseFile(kind, readFixture(name), name);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

const rawOf = (files: ParsedFile[]): RawRun => {
  const r = joinRun(files);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

const full = () =>
  rawOf([parsed("mutation-report", "report.json"), parsed("verdict", "verdict.json")]);

describe("run model", () => {
  it("1.5 plain report gives species from the mutator name and no criteria", () => {
    const model = buildRunModel(rawOf([parsed("mutation-report", "plain-stryker-report.json")]));
    expect(model.verdict).toBeUndefined();
    expect(model.mutants.map((m) => m.species)).toEqual(["Miscount", "Miscount"]);
    expect(model.mutants.every((m) => m.requirement === undefined)).toBe(true);
    expect(model.mutants.map((m) => m.state)).toEqual(["killed", "survivor"]);
  });

  it("4.9 Verdict_File species and status win over the report", () => {
    const base = full();
    const verdict = base.verdict!;
    const raw: RawRun = {
      ...base,
      verdict: {
        ...verdict,
        mutants: verdict.mutants.map((e) =>
          e.id === "m1" ? { ...e, species: "Hollow", status: "Killed" } : e,
        ),
      },
    };
    const m1 = buildRunModel(raw).mutants.find((m) => m.id === "m1")!;
    expect(m1.reportStatus).toBe("Survived");
    expect(m1.state).toBe("killed");
    expect(m1.species).toBe("Hollow");
  });

  it("4.10 missing verdict entry falls back to the report and does not throw", () => {
    const model = buildRunModel(full());
    const m3 = model.mutants.find((m) => m.id === "m3")!;
    expect(m3.verdictEntry).toBeUndefined();
    expect(m3.state).toBe("killed");
    expect(m3.species).toBe("Two-Face");
  });

  it("4.8 not-counted mutants stay in the list", () => {
    const base = full();
    const raw: RawRun = {
      ...base,
      report: {
        ...base.report,
        files: {
          "a.ts": {
            language: "typescript",
            source: "x",
            mutants: [
              {
                id: "z1",
                mutatorName: "Whatever",
                location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
                status: "CompileError",
              },
            ],
          },
        },
      },
      verdict: undefined,
    };
    const model = buildRunModel(raw);
    expect(model.mutants).toHaveLength(1);
    expect(model.mutants[0]?.state).toBe("not-counted");
    expect(model.mutants[0]?.species).toBe("Unclassified");
  });

  it("1.5 original comes from the source and location, replacement from the report", () => {
    const raw = rawOf([parsed("mutation-report", "plain-stryker-report.json")]);
    const first = Object.values(raw.report.files)[0]!;
    const model = buildRunModel({
      ...raw,
      report: {
        ...raw.report,
        files: {
          f: {
            ...first,
            source: "const a = 1 + 2;\n",
            mutants: [
              {
                ...first.mutants[0]!,
                location: { start: { line: 1, column: 11 }, end: { line: 1, column: 16 } },
              },
            ],
          },
        },
      },
    });
    expect(model.mutants[0]?.original).toBe("1 + 2");
    expect(model.mutants[0]?.replacement).toBe("a - 1");
  });

  it("4.11 two reads of one RunModel give identical values and the RawRun is not mutated", () => {
    const raw = full();
    const before = JSON.stringify(raw);
    const model = buildRunModel(raw);
    const read = () => model.mutants.map((m) => [m.id, m.species, m.state]);
    expect(read()).toEqual(read());
    expect(JSON.stringify(raw)).toBe(before);
    expect(JSON.stringify(buildRunModel(raw).mutants)).toBe(JSON.stringify(model.mutants));
  });
});
