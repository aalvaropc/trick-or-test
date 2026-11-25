import { describe, expect, it } from "vitest";
import { parseHistoryLines, serializeHistoryRecord } from "../../src/core/report.js";
import type { HistoryRecord, MutantId } from "../../src/core/types.js";

const rec = (over: Partial<HistoryRecord> = {}): HistoryRecord => ({
  time: "2025-01-01T00:00:00.000Z",
  gitCommit: "abc123",
  seed: 42,
  config: {
    specDir: ".kiro/specs/x",
    sourceGlobs: ["src/**/*.ts"],
    testGlobs: ["test/**/*.test.ts"],
    propertyTestGlobs: ["test/**/*.property.test.ts"],
    mutantsDir: "mutants",
    outputDir: "out",
  },
  mutants: [{ id: "a" as MutantId, status: "Killed" }],
  statusCounts: {
    Killed: 1,
    Survived: 0,
    Timeout: 0,
    Ghost: 0,
    InvalidWitness: 0,
    CompileError: 0,
    NotApplicable: 0,
  },
  coverageCounts: { guarded: 1, unguarded: 0, unattacked: 0, skipped: 0 },
  newlyKilledIds: ["a" as MutantId],
  ...over,
});

describe("history.jsonl lines", () => {
  it("8.16 one record gives one line without a newline", () => {
    const line = serializeHistoryRecord(rec());
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual(rec());
  });

  it("8.16 string fields with newlines stay on one line and round-trip", () => {
    const r = rec({ gitCommit: "a\nb\r\nc" });
    const line = serializeHistoryRecord(r);
    expect(line).not.toContain("\n");
    expect(line).not.toContain("\r");
    const parsed = parseHistoryLines(`${line}\n`);
    expect(parsed).toEqual({ ok: true, value: [r] });
  });

  it("8.16 an empty file gives an empty list", () => {
    expect(parseHistoryLines("")).toEqual({ ok: true, value: [] });
  });

  it("8.16 a trailing newline is accepted and order is kept", () => {
    const a = rec({ seed: 1 });
    const b = rec({ seed: 2 });
    const text = `${serializeHistoryRecord(a)}\n${serializeHistoryRecord(b)}\n`;
    expect(parseHistoryLines(text)).toEqual({ ok: true, value: [a, b] });
  });

  it("8.16 a blank line between records is skipped", () => {
    const a = rec({ seed: 1 });
    const b = rec({ seed: 2 });
    const text = `${serializeHistoryRecord(a)}\n\n${serializeHistoryRecord(b)}`;
    expect(parseHistoryLines(text)).toEqual({ ok: true, value: [a, b] });
  });

  it("8.16 a malformed line returns an error naming its line number", () => {
    const text = `${serializeHistoryRecord(rec())}\n{not json\n`;
    const r = parseHistoryLines(text);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.line).toBe(2);
      expect(r.error.message).toContain("Line 2");
    }
  });

  it("8.16 a line holding a JSON array instead of an object is an error", () => {
    const r = parseHistoryLines(
      `${serializeHistoryRecord(rec())}\n\n[${serializeHistoryRecord(rec())}]`,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.line).toBe(3);
  });

  it("8.10 a schema-invalid line returns an error naming its line number", () => {
    const bad = JSON.stringify({ ...rec(), seed: 1.5 });
    const r = parseHistoryLines(`${bad}\n`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.line).toBe(1);
      expect(r.error.message).toContain("seed");
    }
  });

  it("8.10 serializing an invalid record throws", () => {
    expect(() => serializeHistoryRecord(rec({ seed: 1.5 }))).toThrow(/seed/);
  });
});
