import { describe, expect, it } from "vitest";
import { parseChangedRanges } from "../../src/core/changed-ranges.js";

const GLOBS = ["src/**/*.ts"];

const fileDiff = (path: string, hunks: string[]): string =>
  [
    `diff --git a/${path} b/${path}`,
    "index 1111111..2222222 100644",
    `--- a/${path}`,
    `+++ b/${path}`,
    ...hunks.flatMap((header) => [header, "-old", "+new"]),
    "",
  ].join("\n");

describe("changed-ranges: parseChangedRanges", () => {
  it("3.9 one hunk becomes one project-relative range", () => {
    const diff = fileDiff("src/price.ts", ["@@ -10,2 +10,3 @@ export const x = 1;"]);
    expect(parseChangedRanges(diff, GLOBS)).toEqual([{ file: "src/price.ts", start: 10, end: 12 }]);
  });

  it("3.9 several hunks in one file are sorted by start line", () => {
    const diff = fileDiff("src/price.ts", [
      "@@ -40,0 +41,2 @@",
      "@@ -3 +3,1 @@",
      "@@ -20,1 +20,4 @@",
    ]);
    expect(parseChangedRanges(diff, GLOBS)).toEqual([
      { file: "src/price.ts", start: 3, end: 3 },
      { file: "src/price.ts", start: 20, end: 23 },
      { file: "src/price.ts", start: 41, end: 42 },
    ]);
  });

  it("3.9 ranges are sorted by file before start line", () => {
    const diff = fileDiff("src/z.ts", ["@@ -1 +1 @@"]) + fileDiff("src/a.ts", ["@@ -9 +9 @@"]);
    expect(parseChangedRanges(diff, GLOBS).map((r) => r.file)).toEqual(["src/a.ts", "src/z.ts"]);
  });

  it("3.9 a pure deletion yields no range", () => {
    const diff = fileDiff("src/price.ts", ["@@ -5,3 +4,0 @@"]);
    expect(parseChangedRanges(diff, GLOBS)).toEqual([]);
  });

  it("3.9 a file that does not match the source globs yields no range", () => {
    const diff =
      fileDiff("test/price.test.ts", ["@@ -1 +1 @@"]) + fileDiff("src/price.ts", ["@@ -2 +2 @@"]);
    expect(parseChangedRanges(diff, GLOBS)).toEqual([{ file: "src/price.ts", start: 2, end: 2 }]);
  });

  it("3.10 a file outside the project directory yields no range", () => {
    const diff =
      fileDiff("../other/src/x.ts", ["@@ -1 +1 @@"]) + fileDiff("/abs/src/y.ts", ["@@ -1 +1 @@"]);
    expect(parseChangedRanges(diff, ["**/*.ts", "../**/*.ts", "/abs/**/*.ts"])).toEqual([]);
  });

  it("3.9 a hunk header without a count means one line", () => {
    const diff = fileDiff("src/price.ts", ["@@ -1 +1 @@"]);
    expect(parseChangedRanges(diff, GLOBS)).toEqual([{ file: "src/price.ts", start: 1, end: 1 }]);
  });

  it("3.9 an empty diff yields no range", () => {
    expect(parseChangedRanges("", GLOBS)).toEqual([]);
  });
});
