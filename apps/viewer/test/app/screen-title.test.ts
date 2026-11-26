import { describe, expect, it } from "vitest";
import { screenTitle } from "../../src/app/screen-title.js";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import { buildRunModel, type RunModel } from "../../src/loader/run-model.js";
import type { ParsedFile } from "../../src/loader/types.js";
import { readFixture } from "../fixtures/load.js";

const parsed = (kind: "mutation-report" | "verdict", name: string): ParsedFile => {
  const result = parseFile(kind, readFixture(name), name);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const load = (withVerdict: boolean): RunModel => {
  const files = [parsed("mutation-report", "report.json")];
  if (withVerdict) files.push(parsed("verdict", "verdict.json"));
  const joined = joinRun(files);
  if (!joined.ok) throw new Error(joined.error.message);
  return buildRunModel(joined.value);
};

/** The fixture has one surviving Spec_Mutant (m6). This changes the state of chosen mutants. */
const withStates = (run: RunModel, states: Record<string, "survivor" | "killed">): RunModel => ({
  ...run,
  mutants: run.mutants.map((m) => {
    const state = states[m.id];
    return state === undefined ? m : { ...m, state };
  }),
});

describe("screen titles", () => {
  it("13.6 the Landing title is the product title", () => {
    expect(screenTitle("landing", {})).toBe("A Bestiary of Bugs Your Tests Never Noticed");
  });

  it("13.6 the Verdict title says that 1 monster disagrees for one survivor", () => {
    expect(screenTitle("verdict", { run: load(true) })).toBe("1 monster disagrees");
  });

  it("13.6 the Verdict title says that no monster disagrees for zero survivors", () => {
    const run = withStates(load(true), { m6: "killed" });
    expect(screenTitle("verdict", { run })).toBe("No monster disagrees");
  });

  it("13.6 the Verdict title counts two survivors", () => {
    const run = withStates(load(true), { m7: "survivor" });
    expect(screenTitle("verdict", { run })).toBe("2 monsters disagree");
  });

  it("13.6 the Verdict title without a Verdict_File is 'Mutants that survived the tests'", () => {
    expect(screenTitle("verdict", { run: load(false) })).toBe("Mutants that survived the tests");
  });

  it("13.6 the Verdict title without a run is 'Mutants that survived the tests'", () => {
    expect(screenTitle("verdict", {})).toBe("Mutants that survived the tests");
  });

  it("13.6 the Specimen title names the Species of the mutant", () => {
    expect(screenTitle("specimen", { run: load(true), mutantId: "m6" })).toBe("The Oathbreaker");
    expect(screenTitle("specimen", { run: load(true), mutantId: "m2" })).toBe("The Borderling");
  });

  it("13.6 the Specimen title for an unknown id is 'Specimen not found'", () => {
    expect(screenTitle("specimen", { run: load(true), mutantId: "nope" })).toBe(
      "Specimen not found",
    );
  });

  it("13.6 the Specimen title without a run is 'Specimen not found'", () => {
    expect(screenTitle("specimen", { mutantId: "m6" })).toBe("Specimen not found");
  });

  it("13.6 the Hunt title is 'The hunt'", () => {
    expect(screenTitle("hunt", {})).toBe("The hunt");
  });

  it("13.6 the Plain_View title is 'Plain view'", () => {
    expect(screenTitle("plain", {})).toBe("Plain view");
  });
});
