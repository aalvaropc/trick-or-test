import { describe, expect, it } from "vitest";
import { parseFile } from "../../src/loader/parse.js";
import { recognise } from "../../src/loader/recognise.js";
import { historyCrlf, readFixture } from "../fixtures/load.js";

describe("parseFile", () => {
  it("1.7 invalid JSON names the file", () => {
    const r = parseFile("mutation-report", "{not json", "broken.json");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.fileName).toBe("broken.json");
      expect(r.error.message).toContain("broken.json");
    }
  });

  it("1.8 a schema failure lists the failing field paths", () => {
    const r = parseFile("verdict", JSON.stringify({ coverage: [{ criterion: 1 }] }), "v.json");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.fileName).toBe("v.json");
      expect(r.error.fieldPaths?.length).toBeGreaterThan(0);
      expect(r.error.truncatedCount).toBeUndefined();
    }
  });

  it("1.8 field paths truncate at 10 and give the remaining count", () => {
    const report = JSON.parse(readFixture("report.json")) as { files: Record<string, unknown> };
    const files: Record<string, unknown> = {};
    for (let i = 0; i < 14; i++) files[`f${i}.ts`] = { bad: true };
    const r = parseFile("mutation-report", JSON.stringify({ ...report, files }), "big.json");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.fieldPaths).toHaveLength(10);
      expect(r.error.truncatedCount).toBeGreaterThan(0);
    }
  });

  it("1.13 the history line number counts blank lines before the bad line", () => {
    const text = readFixture("history-bad-line-3.jsonl");
    const r = parseFile("history", text, "h.jsonl");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.fileName).toBe("h.jsonl");
      expect(r.error.line).toBe(3);
    }
  });

  it("1.13 a history line that fails the schema carries its field paths", () => {
    const good = readFixture("history.jsonl").split("\n")[0] ?? "";
    const r = parseFile("history", `${good}\n\n{"time":5}\n`, "h.jsonl");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.line).toBe(3);
      expect(r.error.fieldPaths?.length).toBeGreaterThan(0);
    }
  });

  it("1.13 a valid history file parses every record in order", () => {
    const r = parseFile("history", readFixture("history-blank-line.jsonl"), "h.jsonl");
    expect(r.ok).toBe(true);
    if (r.ok && r.value.kind === "history") expect(r.value.records.length).toBeGreaterThan(1);
  });

  it("12.14 no fixture makes recognise or parseFile throw", () => {
    const names = [
      "report.json",
      "verdict.json",
      "plain-stryker-report.json",
      "single-line-report.json",
      "history.jsonl",
      "history-blank-line.jsonl",
      "history-bad-line-3.jsonl",
      "history-trailing-newline.jsonl",
      "empty.txt",
      "whitespace-only.txt",
    ];
    const texts = [...names.map((n) => readFixture(n)), historyCrlf()];
    for (const text of texts) {
      const kind = recognise(text, "x");
      for (const k of ["mutation-report", "verdict", "history", "unknown"] as const) {
        expect(() => parseFile(k, text, "x")).not.toThrow();
      }
      if (kind.ok) expect(() => parseFile(kind.value, text, "x")).not.toThrow();
    }
  });

  it("12.14 valid fixtures parse", () => {
    expect(parseFile("mutation-report", readFixture("report.json"), "r").ok).toBe(true);
    expect(parseFile("mutation-report", readFixture("plain-stryker-report.json"), "p").ok).toBe(
      true,
    );
    expect(parseFile("verdict", readFixture("verdict.json"), "v").ok).toBe(true);
    expect(parseFile("history", historyCrlf(), "h").ok).toBe(true);
  });
});
