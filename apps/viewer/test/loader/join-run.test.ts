import { describe, expect, it } from "vitest";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import type { FileKind, ParsedFile } from "../../src/loader/types.js";
import { readFixture } from "../fixtures/load.js";

const load = (kind: FileKind, fixture: string, text = readFixture(fixture)): ParsedFile => {
  const r = parseFile(kind, text, fixture);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

const report = () => load("mutation-report", "report.json");
const verdict = () => load("verdict", "verdict.json");
const history = () => load("history", "history.jsonl");

describe("joinRun", () => {
  it("1.2 a valid report displays as a RawRun", () => {
    const r = joinRun([report()]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.report.schemaVersion).toBe("2");
      expect(r.value.verdict).toBeUndefined();
      expect(r.value.history).toEqual([]);
      expect(r.value.ignoredVerdictEntryCount).toBe(0);
    }
  });

  it("1.3 joins verdict mutants to report mutants by id", () => {
    const r = joinRun([verdict(), report()]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verdict?.mutants.map((m) => m.id)).toEqual(["m1", "m2", "m5", "m6", "m7"]);
      expect(r.value.verdict?.coverage.length).toBeGreaterThan(0);
    }
  });

  it("1.4 orders history by time and keeps file order for equal time", () => {
    const original = history();
    if (original.kind !== "history") throw new Error("fixture");
    const reversed: ParsedFile = { ...original, records: [...original.records].reverse() };
    const r = joinRun([report(), reversed]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // reversed file order has ccc3333 before bbb2222 (equal time); that order is kept
      expect(r.value.history.map((h) => h.gitCommit)).toEqual([
        "aaa1111",
        "ccc3333",
        "bbb2222",
        "ddd4444",
      ]);
    }
    const inOrder = joinRun([report(), original]);
    if (inOrder.ok) {
      expect(inOrder.value.history.map((h) => h.gitCommit)).toEqual([
        "aaa1111",
        "bbb2222",
        "ccc3333",
        "ddd4444",
      ]);
    }
  });

  it("1.5 a plain Stryker report becomes a RawRun without Criterion data", () => {
    const r = joinRun([load("mutation-report", "plain-stryker-report.json")]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verdict).toBeUndefined();
      expect(r.value.ignoredVerdictEntryCount).toBe(0);
    }
  });

  it("1.10 counts verdict entries with no matching report mutant", () => {
    const r = joinRun([report(), verdict()]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.ignoredVerdictEntryCount).toBe(1);
  });

  it("1.10 does not mutate the parsed inputs", () => {
    const files = [report(), verdict(), history()];
    const before = structuredClone(files);
    joinRun(files);
    expect(files).toEqual(before);
  });

  it("1.9 no report gives the Mutation_Report required error", () => {
    const r = joinRun([verdict(), history()]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("A Mutation_Report is required.");
  });
});
