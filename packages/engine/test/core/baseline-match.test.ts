import { describe, expect, it } from "vitest";
import {
  type BaselineTestSource,
  indexBaselineTests,
  matchBaselineTest,
} from "../../src/core/baseline-match.js";

const src = (file: string, titles: string[], startLine: number): BaselineTestSource => ({
  file,
  titles,
  startLine,
});

describe("baseline-match", () => {
  it("6.14 a plain test matches its StrykerJS name", () => {
    const index = indexBaselineTests([src("test/a.test.ts", ["accepts carts"], 3)]);
    expect(matchBaselineTest(index, { file: "test/a.test.ts", name: "accepts carts" })).toBe(
      "test/a.test.ts::accepts carts",
    );
  });

  it("6.14 a test in nested describe blocks matches the ' > ' joined name", () => {
    const index = indexBaselineTests([src("test/a.test.ts", ["public API", "inner", "works"], 9)]);
    expect(
      matchBaselineTest(index, { file: "test/a.test.ts", name: "public API > inner > works" }),
    ).toBe("test/a.test.ts::public API inner works");
  });

  it("6.14 a title that itself contains ' > ' matches", () => {
    const index = indexBaselineTests([src("test/a.test.ts", ["a > b"], 4)]);
    expect(matchBaselineTest(index, { file: "test/a.test.ts", name: "a > b" })).toBe(
      "test/a.test.ts::a > b",
    );
  });

  it("6.14 the space-joined name of a nested test is not rewritten and gives none", () => {
    const index = indexBaselineTests([src("test/a.test.ts", ["public API", "works"], 9)]);
    expect(matchBaselineTest(index, { file: "test/a.test.ts", name: "public API works" })).toBe(
      "none",
    );
  });

  const twins = [src("test/a.test.ts", ["a > b"], 4), src("test/a.test.ts", ["a", "b"], 10)];

  it("6.14 two title lists with the same joined text are told apart by the start line", () => {
    const index = indexBaselineTests(twins);
    expect(matchBaselineTest(index, { file: "test/a.test.ts", name: "a > b", startLine: 4 })).toBe(
      "test/a.test.ts::a > b",
    );
    expect(matchBaselineTest(index, { file: "test/a.test.ts", name: "a > b", startLine: 10 })).toBe(
      "test/a.test.ts::a b",
    );
  });

  it("6.14 an ambiguous name without a start line gives none", () => {
    const index = indexBaselineTests(twins);
    expect(matchBaselineTest(index, { file: "test/a.test.ts", name: "a > b" })).toBe("none");
  });

  it("6.14 an ambiguous name whose start line matches neither gives none", () => {
    const index = indexBaselineTests(twins);
    expect(matchBaselineTest(index, { file: "test/a.test.ts", name: "a > b", startLine: 7 })).toBe(
      "none",
    );
  });

  it("6.14 an ambiguous name whose start line matches both gives none", () => {
    const index = indexBaselineTests([
      src("test/a.test.ts", ["a > b"], 4),
      src("test/a.test.ts", ["a", "b"], 4),
    ]);
    expect(matchBaselineTest(index, { file: "test/a.test.ts", name: "a > b", startLine: 4 })).toBe(
      "none",
    );
  });

  it("6.14 a duplicate-title pair with one id gives that id", () => {
    const index = indexBaselineTests([
      src("test/a.test.ts", ["dup"], 3),
      src("test/a.test.ts", ["dup"], 8),
    ]);
    expect(matchBaselineTest(index, { file: "test/a.test.ts", name: "dup" })).toBe(
      "test/a.test.ts::dup",
    );
  });

  it("6.15 a name that matches no test gives none", () => {
    const index = indexBaselineTests([src("test/a.test.ts", ["one"], 3)]);
    expect(matchBaselineTest(index, { file: "test/a.test.ts", name: "two" })).toBe("none");
  });

  it("6.15 a killer in another file gives none", () => {
    const index = indexBaselineTests([src("test/a.test.ts", ["one"], 3)]);
    expect(matchBaselineTest(index, { file: "test/b.test.ts", name: "one" })).toBe("none");
  });

  it("6.15 a killer whose test is not in the list (skipped) gives none", () => {
    const index = indexBaselineTests([src("test/a.test.ts", ["one"], 3)]);
    expect(matchBaselineTest(index, { file: "test/a.test.ts", name: "skipped one" })).toBe("none");
  });

  it("6.13 the order of the input list does not change the result", () => {
    const forward = indexBaselineTests(twins);
    const backward = indexBaselineTests([...twins].reverse());
    const killer = { file: "test/a.test.ts", name: "a > b", startLine: 10 };
    expect(matchBaselineTest(backward, killer)).toBe(matchBaselineTest(forward, killer));
    expect(matchBaselineTest(backward, killer)).toBe("test/a.test.ts::a b");
  });
});
