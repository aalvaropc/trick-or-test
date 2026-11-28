import { describe, expect, it } from "vitest";
import {
  type BaselineTestSource,
  indexBaselineTests,
  matchBaselineTest,
  strykerSeparatorFor,
} from "../../src/core/baseline-match.js";

const nested: BaselineTestSource = {
  file: "test/a.test.ts",
  titles: ["outer", "inner"],
  startLine: 3,
};
const ID = "test/a.test.ts::outer inner";
const killer = (name: string) => ({ file: "test/a.test.ts", name });

describe("baseline-match separator", () => {
  it.each(["4.1.0", "0.34.6"])("6.16 version %s uses the space separator", (version) => {
    expect(strykerSeparatorFor(version)).toBe(" ");
  });

  it.each(["5.0.0", "5.0.0-beta.1", "5.1.0", "10.2.3"])(
    "6.16 version %s uses the ' > ' separator",
    (version) => {
      expect(strykerSeparatorFor(version)).toBe(" > ");
    },
  );

  it.each([undefined, "", "unknown", "v5"])(
    "6.16 unreadable version %j uses the ' > ' separator",
    (version) => {
      expect(strykerSeparatorFor(version)).toBe(" > ");
    },
  );

  it("6.16 with the version 4 separator the space name matches and the arrow name does not", () => {
    const index = indexBaselineTests([nested], strykerSeparatorFor("4.1.0"));
    expect(matchBaselineTest(index, killer("outer inner"))).toBe(ID);
    expect(matchBaselineTest(index, killer("outer > inner"))).toBe("none");
  });

  it("6.16 with the version 5 separator the arrow name matches and the space name does not", () => {
    const index = indexBaselineTests([nested], strykerSeparatorFor("5.0.0"));
    expect(matchBaselineTest(index, killer("outer > inner"))).toBe(ID);
    expect(matchBaselineTest(index, killer("outer inner"))).toBe("none");
  });

  it("6.16 an unreadable version behaves as version 5", () => {
    const index = indexBaselineTests([nested], strykerSeparatorFor(undefined));
    expect(matchBaselineTest(index, killer("outer > inner"))).toBe(ID);
    expect(matchBaselineTest(index, killer("outer inner"))).toBe("none");
  });

  it("6.16 indexBaselineTests without a separator equals the ' > ' index", () => {
    const sources = [nested, { file: "test/b.test.ts", titles: ["solo"], startLine: 1 }];
    expect(indexBaselineTests(sources)).toEqual(indexBaselineTests(sources, " > "));
  });
});
