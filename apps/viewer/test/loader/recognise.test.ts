import { describe, expect, it } from "vitest";
import { recognise } from "../../src/loader/recognise.js";
import { historyCrlf, readFixture } from "../fixtures/load.js";

const kind = (text: string) => {
  const r = recognise(text, "f.json");
  return r.ok ? r.value : r.error;
};

describe("recognise", () => {
  it("1.6 a single-line report is a mutation-report, not history", () => {
    expect(kind(readFixture("single-line-report.json"))).toBe("mutation-report");
  });

  it("1.6 trick or test report, plain Stryker report and verdict are recognised by content", () => {
    expect(kind(readFixture("report.json"))).toBe("mutation-report");
    expect(kind(readFixture("plain-stryker-report.json"))).toBe("mutation-report");
    expect(kind(readFixture("verdict.json"))).toBe("verdict");
  });

  it("1.12 history, with a blank line, CRLF and a trailing newline", () => {
    expect(kind(readFixture("history.jsonl"))).toBe("history");
    expect(kind(readFixture("history-blank-line.jsonl"))).toBe("history");
    expect(kind(historyCrlf())).toBe("history");
    expect(kind(readFixture("history-trailing-newline.jsonl"))).toBe("history");
  });

  it("1.12 a history file with one bad line is still recognised as history", () => {
    expect(kind(readFixture("history-bad-line-3.jsonl"))).toBe("history");
  });

  it("1.14 zero-byte and whitespace-only files give the empty error", () => {
    for (const name of ["empty.txt", "whitespace-only.txt"]) {
      const r = recognise(readFixture(name), name);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.fileName).toBe(name);
        expect(r.error.message).toMatch(/empty/i);
      }
    }
  });

  it("1.7 invalid JSON names the file", () => {
    const r = recognise("{ not json", "broken.json");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.fileName).toBe("broken.json");
      expect(r.error.message).toMatch(/not valid JSON/);
    }
  });

  it("1.9 valid JSON of another shape is unknown", () => {
    expect(kind('{"hello":1}')).toBe("unknown");
  });
});
