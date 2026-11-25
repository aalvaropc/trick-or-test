import { describe, expect, it } from "vitest";
import { type ProjectEntry, planSandboxCopy } from "../../src/core/sandbox-plan.js";

const dir = (path: string): ProjectEntry => ({ path, kind: "dir" });
const file = (path: string): ProjectEntry => ({ path, kind: "file" });

const actions = (entries: readonly ProjectEntry[], outputDir: string): Record<string, string> =>
  Object.fromEntries(planSandboxCopy(entries, outputDir).map((item) => [item.path, item.action]));

describe("planSandboxCopy output directory", () => {
  it("5.19 skips `reports` and its children when it is the output directory", () => {
    expect(actions([dir("reports"), file("reports/a.json")], "reports")).toEqual({
      reports: "skip",
      "reports/a.json": "skip",
    });
  });

  it("5.19 copies `src/reports` when `reports` is the output directory", () => {
    expect(actions([dir("src/reports"), file("src/reports/a.ts")], "reports")).toEqual({
      "src/reports": "copy",
      "src/reports/a.ts": "copy",
    });
  });

  it("5.19 skips `out/reports` and its children when it is the output directory", () => {
    expect(actions([dir("out/reports"), file("out/reports/a.json")], "out/reports")).toEqual({
      "out/reports": "skip",
      "out/reports/a.json": "skip",
    });
  });

  it("5.19 copies `reports`, `out` and `src/out/reports` when `out/reports` is the output directory", () => {
    expect(
      actions(
        [dir("reports"), dir("out"), file("out/other.ts"), dir("src/out/reports")],
        "out/reports",
      ),
    ).toEqual({
      reports: "copy",
      out: "copy",
      "out/other.ts": "copy",
      "src/out/reports": "copy",
    });
  });

  it("5.19 normalizes a leading `./` and a trailing slash of the output directory", () => {
    expect(actions([dir("out/reports"), dir("reports")], "./out/reports/")).toEqual({
      "out/reports": "skip",
      reports: "copy",
    });
  });

  it("5.19 does not skip a sibling whose name only starts with the output directory name", () => {
    expect(actions([dir("reports-old")], "reports")).toEqual({ "reports-old": "copy" });
  });
});
