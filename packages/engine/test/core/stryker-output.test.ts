import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseStrykerReport } from "../../src/core/stryker-output.js";

// Real StrykerJS 10.1.1 JSON report captured from a throwaway project (task 12.10).
const FIXTURE = new URL("../fixtures/stryker/mutation-report.json", import.meta.url);
const loadFixture = (): Record<string, unknown> =>
  JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;

type RawMutant = Record<string, unknown>;
const rawMutants = (report: Record<string, unknown>): RawMutant[] =>
  (report.files as Record<string, { mutants: RawMutant[] }>)["src/price.ts"]?.mutants ?? [];

describe("parseStrykerReport", () => {
  it("3.16 the captured StrykerJS 10.1.1 report parses", () => {
    const result = parseStrykerReport(loadFixture());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value.files)).toEqual(["src/price.ts"]);
    expect(result.value.files["src/price.ts"]?.mutants).toHaveLength(15);
  });

  it("3.16 every mutant of the captured report keeps its four location numbers", () => {
    const raw = loadFixture();
    const result = parseStrykerReport(raw);
    if (!result.ok) throw new Error(result.error.message);
    const parsed = result.value.files["src/price.ts"]?.mutants ?? [];
    const expected = rawMutants(raw).map((m) => m.location);
    expect(parsed.map((m) => m.location)).toEqual(expected);
    for (const mutant of parsed) {
      expect(Number.isInteger(mutant.location.start.line)).toBe(true);
      expect(Number.isInteger(mutant.location.start.column)).toBe(true);
      expect(Number.isInteger(mutant.location.end.line)).toBe(true);
      expect(Number.isInteger(mutant.location.end.column)).toBe(true);
    }
  });

  it("3.16 a surviving EqualityOperator mutant keeps location 2:7-2:29 and its fields", () => {
    const result = parseStrykerReport(loadFixture());
    if (!result.ok) throw new Error(result.error.message);
    const mutant = result.value.files["src/price.ts"]?.mutants.find((m) => m.id === "3");
    expect(mutant).toEqual({
      id: "3",
      mutatorName: "EqualityOperator",
      replacement: "subtotalCents > 10000",
      status: "Survived",
      location: { start: { line: 2, column: 7 }, end: { line: 2, column: 29 } },
      killedBy: [],
    });
  });

  it("3.16 a killed mutant keeps killedBy and the tests are kept in testFiles", () => {
    const result = parseStrykerReport(loadFixture());
    if (!result.ok) throw new Error(result.error.message);
    const mutant = result.value.files["src/price.ts"]?.mutants.find((m) => m.id === "0");
    expect(mutant?.status).toBe("Killed");
    expect(mutant?.killedBy).toEqual(["0", "1"]);
    expect(result.value.testFiles["test/price.test.ts"]).toEqual([
      {
        id: "0",
        name: "charges shipping below the threshold",
        location: { start: { line: 4, column: 1 } },
      },
      {
        id: "1",
        name: "ships free far above the threshold",
        location: { start: { line: 8, column: 1 } },
      },
      { id: "2", name: "labels a positive subtotal", location: { start: { line: 12, column: 1 } } },
    ]);
  });

  it("10.12 a report whose mutant has no location is an error that names the file and the field", () => {
    const raw = loadFixture();
    delete rawMutants(raw)[0]?.location;
    const result = parseStrykerReport(raw, ".trickortest/mutation.json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.filePath).toBe(".trickortest/mutation.json");
    expect(result.error.field).toBe("files.src/price.ts.mutants.0.location");
    expect(result.error.message).toContain(".trickortest/mutation.json");
    expect(result.error.message).toContain("files.src/price.ts.mutants.0.location");
  });

  it("10.12 an unknown extra field is accepted", () => {
    const raw = loadFixture();
    raw.somethingNew = { added: "by a later StrykerJS" };
    const first = rawMutants(raw)[0];
    if (first !== undefined) first.unknownMutantField = 42;
    const result = parseStrykerReport(raw);
    expect(result.ok).toBe(true);
  });
});
