import { historyRecordSchema, mutationReportSchema, verdictSchema } from "trick-or-test/report";
import { describe, expect, it } from "vitest";
import { historyCrlf, readFixture } from "./load.js";

const nonEmptyLines = (text: string): string[] =>
  text.split(/\r?\n/).filter((l) => l.trim() !== "");

describe("fixtures", () => {
  it("2.6 report.json passes mutationReportSchema with the expected statuses", () => {
    const parsed = mutationReportSchema.safeParse(JSON.parse(readFixture("report.json")));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const mutants = Object.values(parsed.data.files).flatMap((f) => f.mutants);
    const statuses = new Set(mutants.map((m) => m.status));
    for (const s of ["Survived", "Killed", "Timeout", "NoCoverage", "Ignored"] as const) {
      expect(statuses.has(s)).toBe(true);
    }
    expect(mutants.some((m) => m.species !== undefined && m.requirement !== undefined)).toBe(true);
    const ignored = mutants.filter((m) => m.status === "Ignored");
    expect(ignored).toHaveLength(1);
    expect(ignored[0]?.statusReason).toContain("Ghost");
  });

  it("2.6 verdict.json passes verdictSchema with all four coverage statuses and an unknown id", () => {
    const parsed = verdictSchema.safeParse(JSON.parse(readFixture("verdict.json")));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.coverage.map((c) => c.status).sort()).toEqual([
      "guarded",
      "skipped",
      "unattacked",
      "unguarded",
    ]);
    const report = mutationReportSchema.parse(JSON.parse(readFixture("report.json")));
    const reportIds = new Set(
      Object.values(report.files).flatMap((f) => f.mutants.map((m) => m.id)),
    );
    const unknown = parsed.data.mutants.filter((m) => !reportIds.has(m.id));
    expect(unknown).toHaveLength(1);
  });

  it("2.6 plain-stryker-report.json passes mutationReportSchema without extension fields", () => {
    const parsed = mutationReportSchema.safeParse(
      JSON.parse(readFixture("plain-stryker-report.json")),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const mutants = Object.values(parsed.data.files).flatMap((f) => f.mutants);
    expect(mutants.every((m) => m.species === undefined && m.requirement === undefined)).toBe(true);
  });

  it("2.6 history.jsonl has several valid records, two with equal time", () => {
    const lines = nonEmptyLines(readFixture("history.jsonl"));
    expect(lines.length).toBeGreaterThan(2);
    const records = lines.map((l) => historyRecordSchema.parse(JSON.parse(l)));
    const times = records.map((r) => r.time);
    expect(new Set(times).size).toBeLessThan(times.length);
  });

  it("2.6 history-blank-line.jsonl has a blank line and valid records", () => {
    const text = readFixture("history-blank-line.jsonl");
    expect(text.split("\n").some((l) => l === "")).toBe(true);
    for (const l of nonEmptyLines(text)) {
      expect(historyRecordSchema.safeParse(JSON.parse(l)).success).toBe(true);
    }
  });

  it("2.6 the CRLF history variant has CRLF endings and valid records", () => {
    const text = historyCrlf();
    expect(text).toContain("\r\n");
    for (const l of nonEmptyLines(text)) {
      expect(historyRecordSchema.safeParse(JSON.parse(l)).success).toBe(true);
    }
  });

  it("2.6 history-trailing-newline.jsonl ends with one newline and is valid", () => {
    const text = readFixture("history-trailing-newline.jsonl");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
    for (const l of nonEmptyLines(text)) {
      expect(historyRecordSchema.safeParse(JSON.parse(l)).success).toBe(true);
    }
  });

  it("2.6 history-bad-line-3.jsonl has a valid line 1, a blank line 2 and an invalid line 3", () => {
    const lines = readFixture("history-bad-line-3.jsonl").split(/\r?\n/);
    expect(historyRecordSchema.safeParse(JSON.parse(lines[0] ?? "")).success).toBe(true);
    expect(lines[1]).toBe("");
    expect(() => JSON.parse(lines[2] ?? "")).toThrow();
  });

  it("2.6 empty.txt is zero bytes and whitespace-only.txt has only whitespace", () => {
    expect(readFixture("empty.txt")).toBe("");
    const ws = readFixture("whitespace-only.txt");
    expect(ws.length).toBeGreaterThan(0);
    expect(ws.trim()).toBe("");
  });

  it("2.6 single-line-report.json is one line, a valid report, and not a history record", () => {
    const text = readFixture("single-line-report.json");
    expect(nonEmptyLines(text)).toHaveLength(1);
    const value: unknown = JSON.parse(text);
    expect(mutationReportSchema.safeParse(value).success).toBe(true);
    expect(historyRecordSchema.safeParse(value).success).toBe(false);
  });

  it("2.6 reports and verdicts are not accepted by the wrong schema", () => {
    const report: unknown = JSON.parse(readFixture("report.json"));
    const verdict: unknown = JSON.parse(readFixture("verdict.json"));
    expect(verdictSchema.safeParse(report).success).toBe(false);
    expect(mutationReportSchema.safeParse(verdict).success).toBe(false);
  });
});
