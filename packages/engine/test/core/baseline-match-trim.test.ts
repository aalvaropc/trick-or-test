import { describe, expect, it } from "vitest";
import { indexBaselineTests, matchBaselineTest } from "../../src/core/baseline-match.js";

const file = "test/a.test.ts";

describe("baseline-match trimmed key", () => {
  it("6.17 a trailing space in a title is matched by the trimmed killer and the id stays untrimmed", () => {
    const index = indexBaselineTests([{ file, titles: ["suite", "case "], startLine: 1 }]);
    expect(matchBaselineTest(index, { file, name: "suite > case" })).toBe(`${file}::suite case `);
  });

  it("6.17 a leading space in the first title is matched by the trimmed killer and the id stays untrimmed", () => {
    const index = indexBaselineTests([{ file, titles: [" suite", "case"], startLine: 1 }]);
    expect(matchBaselineTest(index, { file, name: "suite > case" })).toBe(`${file}:: suite case`);
  });

  it("6.17 an empty title inside a describe gives the key 'suite >  > case'", () => {
    const index = indexBaselineTests([{ file, titles: ["suite", "", "case"], startLine: 1 }]);
    expect(matchBaselineTest(index, { file, name: "suite >  > case" })).toBe(
      `${file}::suite  case`,
    );
  });

  it("6.17 a test whose only title is empty has the empty key", () => {
    const index = indexBaselineTests([{ file, titles: [""], startLine: 1 }]);
    expect(matchBaselineTest(index, { file, name: "" })).toBe(`${file}::`);
  });

  it("6.17 a test whose only title is blank has the empty key", () => {
    const index = indexBaselineTests([{ file, titles: ["  "], startLine: 1 }]);
    expect(matchBaselineTest(index, { file, name: "" })).toBe(`${file}::  `);
  });

  it("6.17 a killer that keeps the trailing whitespace matches by the untrimmed key", () => {
    const index = indexBaselineTests([{ file, titles: ["suite", "case "], startLine: 1 }]);
    expect(matchBaselineTest(index, { file, name: "suite > case " })).toBe(`${file}::suite case `);
  });

  it("6.17 a killer with whitespace that no key holds matches nothing", () => {
    const index = indexBaselineTests([{ file, titles: ["suite", "case "], startLine: 1 }]);
    expect(matchBaselineTest(index, { file, name: " suite > case" })).toBe("none");
  });

  it("6.17 a test whose two keys are equal counts as one candidate", () => {
    const index = indexBaselineTests([{ file, titles: ["suite", "case"], startLine: 1 }]);
    expect(matchBaselineTest(index, { file, name: "suite > case" })).toBe(`${file}::suite case`);
  });

  it("6.17 two tests with different ids and one trimmed key are told apart by start line", () => {
    const index = indexBaselineTests([
      { file, titles: ["suite", "case "], startLine: 3 },
      { file, titles: ["suite", "case"], startLine: 8 },
    ]);
    expect(matchBaselineTest(index, { file, name: "suite > case", startLine: 5 })).toBe("none");
    expect(matchBaselineTest(index, { file, name: "suite > case", startLine: 3 })).toBe(
      `${file}::suite case `,
    );
    expect(matchBaselineTest(index, { file, name: "suite > case", startLine: 8 })).toBe(
      `${file}::suite case`,
    );
  });

  it("6.17 two tests with different ids and one trimmed key give none without a start line", () => {
    const index = indexBaselineTests([
      { file, titles: ["suite", "case "], startLine: 3 },
      { file, titles: ["suite", "case"], startLine: 8 },
    ]);
    expect(matchBaselineTest(index, { file, name: "suite > case" })).toBe("none");
  });

  it("6.17 the id is the same with either separator", () => {
    const sources = [{ file, titles: ["suite", "case "], startLine: 1 }];
    const withArrow = matchBaselineTest(indexBaselineTests(sources, " > "), {
      file,
      name: "suite > case",
    });
    const withSpace = matchBaselineTest(indexBaselineTests(sources, " "), {
      file,
      name: "suite case",
    });
    expect(withArrow).toBe(`${file}::suite case `);
    expect(withSpace).toBe(`${file}::suite case `);
  });
});
