import { describe, expect, it } from "vitest";
import { findUnrunTestFiles } from "../../src/core/unrun-test-files.js";

describe("unrun test files", () => {
  it("3.23 a Baseline_Test file missing from the StrykerJS files is counted", () => {
    expect(findUnrunTestFiles(["test/a.test.ts", "extra/g.test.ts"], ["test/a.test.ts"])).toEqual({
      count: 1,
      paths: ["extra/g.test.ts"],
    });
  });

  it("3.23 no missing file gives count 0 and no paths", () => {
    expect(findUnrunTestFiles(["test/a.test.ts"], ["test/a.test.ts", "test/b.test.ts"])).toEqual({
      count: 0,
      paths: [],
    });
  });

  it("3.23 the paths are sorted and listed once", () => {
    expect(findUnrunTestFiles(["z.test.ts", "a.test.ts", "z.test.ts"], [])).toEqual({
      count: 2,
      paths: ["a.test.ts", "z.test.ts"],
    });
  });
});
