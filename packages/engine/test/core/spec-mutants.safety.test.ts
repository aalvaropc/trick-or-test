import { describe, expect, it } from "vitest";
import {
  isSafeMutantId,
  isSafeRelativePath,
  validateSpecMutant,
} from "../../src/core/spec-mutants.js";

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

const withFrom = (from: string): Record<string, unknown> =>
  rawMutant({ witness: { from, export: "f", args: [], expected: 1 } });

const unsafePaths: [string, string][] = [
  ["empty", ""],
  ["POSIX absolute", "/etc/passwd"],
  ["Windows drive letter", "C:\\src\\a.ts"],
  ["Windows drive letter with slash", "C:/src/a.ts"],
  ["UNC", "//server/share/a.ts"],
  ["leading tilde", "~/a.ts"],
  ["dot-dot at the start", "../a.ts"],
  ["dot-dot in the middle", "src/../a.ts"],
  ["dot-dot at the end", "src/.."],
  ["backslash", "src\\a.ts"],
  ["NUL", "src/a\u0000.ts"],
];

describe("12.29 path and id predicates", () => {
  it("4.11 accepts a nested relative path", () => {
    expect(isSafeRelativePath("src/deep/a.ts")).toBe(true);
  });

  it("4.11 accepts a file name that merely contains two dots", () => {
    expect(isSafeRelativePath("src/a..b.ts")).toBe(true);
  });

  it.each(unsafePaths)("4.11 rejects a path that is %s", (_name, p) => {
    expect(isSafeRelativePath(p)).toBe(false);
  });

  it("4.12 accepts an id of letters, digits, dot, underscore and hyphen", () => {
    expect(isSafeMutantId("oath-4.3_threshold-A9")).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["a slash", "oath/1"],
    ["a backslash", "oath\\1"],
    ["a space", "oath 1"],
    ["Unicode", "oath-é"],
    ["two dots", "oath..1"],
  ])("4.12 rejects an id with %s", (_name, id) => {
    expect(isSafeMutantId(id)).toBe(false);
  });
});

describe("12.29 validateSpecMutant safety", () => {
  it("4.11 accepts a nested relative file and witness.from", () => {
    const result = validateSpecMutant(
      { ...rawMutant({ file: "src/deep/a.ts" }), witness: withFrom("src/deep/b.ts").witness },
      FILE,
    );
    expect(result.ok).toBe(true);
  });

  it.each(unsafePaths)("4.11 rejects a file that is %s and names the field", (_name, p) => {
    const result = validateSpecMutant(rawMutant({ file: p }), FILE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.filePath).toBe(FILE);
      expect(result.error.field).toBe("file");
    }
  });

  it.each(unsafePaths)("4.11 rejects a witness.from that is %s and names the field", (_name, p) => {
    const result = validateSpecMutant(withFrom(p), FILE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.filePath).toBe(FILE);
      expect(result.error.field).toBe("witness.from");
    }
  });

  it("4.3 rejects an unsafe file when witness.from is missing, because from defaults to file", () => {
    const result = validateSpecMutant(rawMutant({ file: "../a.ts" }), FILE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("file");
  });

  it.each([
    ["a slash", "oath/1"],
    ["a backslash", "oath\\1"],
    ["a space", "oath 1"],
    ["Unicode", "oath-é"],
    ["two dots", "oath..1"],
  ])("4.12 rejects an id with %s and names the field", (_name, id) => {
    const result = validateSpecMutant(rawMutant({ id }), FILE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.filePath).toBe(FILE);
      expect(result.error.field).toBe("id");
    }
  });
});
