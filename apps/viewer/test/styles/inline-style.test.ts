import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inlineStyleUses, listFiles, srcRoot } from "./css-source.js";

describe("inline style", () => {
  const files = listFiles(srcRoot).filter((f) => /\.tsx?$/.test(f));
  const uses = files.flatMap((f) => inlineStyleUses(f, readFileSync(join(srcRoot, f), "utf8")));

  it("13.24 every style attribute in src carries a runtime-style comment on the line above", () => {
    const unmarked = uses.filter((u) => !u.marked).map((u) => `${u.file}:${u.line}`);
    expect(unmarked).toEqual([]);
  });

  it("13.24 only the who-killed-them bar width computes a style at run time", () => {
    expect(uses.map((u) => u.file)).toEqual(["screens/verdict/WhoKilledPanel.tsx"]);
  });

  it("13.24 the scanner flags an unmarked style and accepts a marked one", () => {
    const bad = inlineStyleUses("a.tsx", '<p style={{ color: "red" }} />');
    expect(bad.map((u) => u.marked)).toEqual([false]);
    const good = inlineStyleUses(
      "a.tsx",
      "{/* runtime-style: width is computed */}\n<p style={{ width }} />",
    );
    expect(good.map((u) => u.marked)).toEqual([true]);
  });
});
