import { describe, expect, it } from "vitest";
import { buildBaselineTests, toTestId } from "../../src/core/baseline-tests.js";

const GLOBS = ["test/**/*.property.test.ts"];
const t = (
  filePath: string,
  fullName: string,
  startLine: number,
  status: "passed" | "failed" | "skipped" | "todo" = "passed",
  bodySource = "expect(1).toBe(1);",
) => ({ filePath, fullName, startLine, bodySource, status });

describe("toTestId", () => {
  it("6.11 the id is the file, two colons and the full name", () => {
    expect(toTestId("test/a.test.ts", "suite 1.1 works")).toBe("test/a.test.ts::suite 1.1 works");
  });
});

describe("buildBaselineTests", () => {
  it("6.12 an empty input gives an empty list", () => {
    expect(buildBaselineTests([], GLOBS)).toEqual([]);
  });

  it("6.12 only passed tests are listed", () => {
    const list = buildBaselineTests(
      [
        t("test/a.test.ts", "ok", 1),
        t("test/a.test.ts", "skipped one", 5, "skipped"),
        t("test/a.test.ts", "todo one", 9, "todo"),
        t("test/a.test.ts", "failed one", 12, "failed"),
      ],
      GLOBS,
    );
    expect(list).toEqual([{ id: "test/a.test.ts::ok", kind: "example" }]);
  });

  it("6.11 the id equals the id of a killing test of the same test", () => {
    const [entry] = buildBaselineTests([t("test/a.test.ts", "s 1.1 x", 3)], GLOBS);
    expect(entry?.id).toBe(toTestId("test/a.test.ts", "s 1.1 x"));
  });

  it("6.12 two tests with the same id give two entries", () => {
    const list = buildBaselineTests(
      [t("test/a.test.ts", "same", 10), t("test/a.test.ts", "same", 20)],
      GLOBS,
    );
    expect(list.map((e) => e.id)).toEqual(["test/a.test.ts::same", "test/a.test.ts::same"]);
  });

  it("6.12 the order is by id and then by start line", () => {
    const list = buildBaselineTests(
      [
        t("test/b.test.ts", "x", 1),
        t("test/a.test.ts", "dup", 30, "passed", "fc.assert(p);"),
        t("test/a.test.ts", "dup", 10),
        t("test/a.test.ts", "alpha", 50),
      ],
      GLOBS,
    );
    expect(list).toEqual([
      { id: "test/a.test.ts::alpha", kind: "example" },
      { id: "test/a.test.ts::dup", kind: "example" },
      { id: "test/a.test.ts::dup", kind: "property" },
      { id: "test/b.test.ts::x", kind: "example" },
    ]);
  });

  it("6.3 a file that matches a property glob gives kind property", () => {
    const [entry] = buildBaselineTests([t("test/core/a.property.test.ts", "p", 1)], GLOBS);
    expect(entry?.kind).toBe("property");
  });

  it("6.4 a body that calls fc.assert gives kind property", () => {
    const [entry] = buildBaselineTests(
      [t("test/a.test.ts", "p", 1, "passed", "fc.assert(fc.property(fc.nat(), () => true));")],
      GLOBS,
    );
    expect(entry?.kind).toBe("property");
  });

  it("6.5 any other test gives kind example", () => {
    const [entry] = buildBaselineTests([t("test/a.test.ts", "e", 1)], GLOBS);
    expect(entry?.kind).toBe("example");
  });
});
