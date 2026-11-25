import { describe, expect, it } from "vitest";
import {
  checkCrossFileRules,
  type LoadedSkipEntry,
  type LoadedSpecMutant,
  loadSpecMutants,
  validateSkipFile,
  validateSpecMutant,
} from "../../src/core/spec-mutants.js";
import type { Criterion, CriterionId, MutantId, SpecMutant } from "../../src/core/types.js";

const FILE = "mutants/cart/oath-1.1-a.json";

const rawMutant = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "oath-1.1-a",
  requirement: "1.1",
  file: "src/a.ts",
  original: "a < b",
  mutated: "a <= b",
  why: "boundary",
  witness: { export: "f", args: [1, 2], expected: 3 },
  ...over,
});

const criterion = (id: string): Criterion => {
  const [req = "0", crit = "0"] = id.split(".");
  return {
    id: id as CriterionId,
    requirement: Number(req),
    criterion: Number(crit),
    text: "text",
    line: 1,
  };
};

const loaded = (id: string, requirement: string, filePath: string): LoadedSpecMutant => {
  const mutant: SpecMutant = {
    id: id as MutantId,
    requirement: requirement as CriterionId,
    file: "src/a.ts",
    original: "x",
    mutated: "y",
    why: "w",
    witness: { from: "src/a.ts", export: "f", args: [], expected: 1 },
  };
  return { filePath, mutant };
};

const skip = (requirement: string, reason: string, index = 0): LoadedSkipEntry => ({
  filePath: "mutants/cart/skipped.json",
  index,
  entry: { requirement: requirement as CriterionId, reason },
});

describe("validateSpecMutant", () => {
  it("4.1 parses a mutant file with all fields", () => {
    const result = validateSpecMutant(JSON.stringify(rawMutant()), FILE);
    expect(result).toEqual({
      ok: true,
      value: {
        id: "oath-1.1-a",
        requirement: "1.1",
        file: "src/a.ts",
        original: "a < b",
        mutated: "a <= b",
        why: "boundary",
        witness: { from: "src/a.ts", export: "f", args: [1, 2], expected: 3 },
      },
    });
  });

  it("4.2 accepts a witness with only expectedError", () => {
    const result = validateSpecMutant(
      rawMutant({ witness: { export: "f", args: [], expectedError: "RangeError" } }),
      FILE,
    );
    expect(result.ok && result.value.witness).toEqual({
      from: "src/a.ts",
      export: "f",
      args: [],
      expectedError: "RangeError",
    });
  });

  it("4.2 accepts expected: null as a present expectation", () => {
    const result = validateSpecMutant(
      rawMutant({ witness: { export: "f", args: [], expected: null } }),
      FILE,
    );
    expect(result.ok).toBe(true);
  });

  it("4.2 rejects a witness with both expected and expectedError", () => {
    const result = validateSpecMutant(
      rawMutant({ witness: { export: "f", args: [], expected: 1, expectedError: "Error" } }),
      FILE,
    );
    expect(result).toMatchObject({ ok: false, error: { filePath: FILE, field: "witness" } });
  });

  it("4.2 rejects a witness with neither expected nor expectedError", () => {
    const result = validateSpecMutant(rawMutant({ witness: { export: "f", args: [] } }), FILE);
    expect(result).toMatchObject({ ok: false, error: { filePath: FILE, field: "witness" } });
  });

  it("4.3 sets from to the file of the mutant when the witness omits it", () => {
    const result = validateSpecMutant(rawMutant({ file: "src/other.ts" }), FILE);
    expect(result.ok && result.value.witness.from).toBe("src/other.ts");
  });

  it("4.3 keeps an explicit from", () => {
    const result = validateSpecMutant(
      rawMutant({ witness: { from: "src/index.ts", export: "f", args: [], expected: 1 } }),
      FILE,
    );
    expect(result.ok && result.value.witness.from).toBe("src/index.ts");
  });

  it("4.4 names the file for invalid JSON", () => {
    const result = validateSpecMutant("{ nope", FILE);
    expect(result).toMatchObject({ ok: false, error: { filePath: FILE } });
  });

  it("4.4 names the file and the field for a missing field", () => {
    const { why: _why, ...withoutWhy } = rawMutant();
    const result = validateSpecMutant(withoutWhy, FILE);
    expect(result).toMatchObject({ ok: false, error: { filePath: FILE, field: "why" } });
  });

  it("4.4 names the field for a wrong type and for an unknown field", () => {
    expect(validateSpecMutant(rawMutant({ original: 5 }), FILE)).toMatchObject({
      ok: false,
      error: { filePath: FILE, field: "original" },
    });
    expect(validateSpecMutant(rawMutant({ extra: 1 }), FILE)).toMatchObject({
      ok: false,
      error: { filePath: FILE, field: "extra" },
    });
  });
});

describe("loadSpecMutants", () => {
  it("4.4 reports a bad file and still loads the others", () => {
    const { mutants, errors } = loadSpecMutants([
      { filePath: "m/bad.json", raw: "{" },
      { filePath: "m/good.json", raw: rawMutant() },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.filePath).toBe("m/bad.json");
    expect(mutants.map((m) => m.mutant.id)).toEqual(["oath-1.1-a"]);
  });

  it("4.10 returns mutants ordered by id", () => {
    const { mutants } = loadSpecMutants([
      { filePath: "m/c.json", raw: rawMutant({ id: "oath-2.1-c" }) },
      { filePath: "m/a.json", raw: rawMutant({ id: "oath-1.1-a" }) },
      { filePath: "m/b.json", raw: rawMutant({ id: "oath-1.2-b" }) },
    ]);
    expect(mutants.map((m) => m.mutant.id)).toEqual(["oath-1.1-a", "oath-1.2-b", "oath-2.1-c"]);
  });
});

describe("validateSkipFile", () => {
  it("4.7 parses entries with a criterion id and a reason", () => {
    const result = validateSkipFile(
      JSON.stringify([{ requirement: "1.1", reason: "not testable by a witness" }]),
      "m/skipped.json",
    );
    expect(result).toEqual({
      ok: true,
      value: [{ requirement: "1.1", reason: "not testable by a witness" }],
    });
  });

  it("4.7 names the file for invalid JSON and for a wrong shape", () => {
    expect(validateSkipFile("[", "m/skipped.json")).toMatchObject({
      ok: false,
      error: { filePath: "m/skipped.json" },
    });
    expect(validateSkipFile({ requirement: "1.1" }, "m/skipped.json")).toMatchObject({
      ok: false,
      error: { filePath: "m/skipped.json" },
    });
  });

  it("4.8 names the entry with an empty reason", () => {
    const result = validateSkipFile(
      [
        { requirement: "1.1", reason: "ok" },
        { requirement: "1.2", reason: "  " },
      ],
      "m/skipped.json",
    );
    expect(result).toMatchObject({
      ok: false,
      error: { filePath: "m/skipped.json", field: "1.reason" },
    });
    expect(!result.ok && result.error.message).toContain("1.2");
  });
});

describe("checkCrossFileRules", () => {
  const criteria = [criterion("1.1"), criterion("1.2"), criterion("2.1")];

  it("4.5 reports a duplicate id and names both files", () => {
    const errors = checkCrossFileRules(
      [loaded("oath-1.1-a", "1.1", "m/first.json"), loaded("oath-1.1-a", "1.2", "m/second.json")],
      [],
      criteria,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("m/first.json");
    expect(errors[0]?.message).toContain("m/second.json");
  });

  it("4.6 reports a requirement that is not a criterion and names file and field", () => {
    const errors = checkCrossFileRules([loaded("oath-9.9-a", "9.9", "m/x.json")], [], criteria);
    expect(errors).toEqual([
      expect.objectContaining({ filePath: "m/x.json", field: "requirement" }),
    ]);
    expect(errors[0]?.message).toContain("9.9");
  });

  it("4.8 reports a skip entry with an empty reason", () => {
    const errors = checkCrossFileRules([], [skip("1.1", "")], criteria);
    expect(errors).toEqual([
      expect.objectContaining({ filePath: "mutants/cart/skipped.json", field: "0.reason" }),
    ]);
  });

  it("4.9 reports a skip entry for an unknown criterion", () => {
    const errors = checkCrossFileRules([], [skip("7.7", "why")], criteria);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("7.7");
  });

  it("4.9 reports a skip entry for a criterion that has a mutant", () => {
    const errors = checkCrossFileRules(
      [loaded("oath-1.1-a", "1.1", "m/a.json")],
      [skip("1.1", "why")],
      criteria,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("also has a Spec_Mutant");
  });

  it("4.5 returns no error for consistent input", () => {
    const errors = checkCrossFileRules(
      [loaded("oath-1.1-a", "1.1", "m/a.json"), loaded("oath-1.2-b", "1.2", "m/b.json")],
      [skip("2.1", "why")],
      criteria,
    );
    expect(errors).toEqual([]);
  });
});
