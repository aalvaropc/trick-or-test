import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classNamesIn, hasSelector, listFiles, readStyleSheets, srcRoot } from "./css-source.js";

describe("class rules", () => {
  const css = Object.values(readStyleSheets()).join("\n");
  const sources = listFiles(srcRoot).filter((f) => /\.tsx?$/.test(f));

  it("13.22 every class name in a className has a selector in src/styles", () => {
    const missing: string[] = [];
    let seen = 0;
    for (const file of sources) {
      const names = classNamesIn(readFileSync(join(srcRoot, file), "utf8"));
      seen += names.length;
      for (const name of names) {
        if (!hasSelector(css, name)) missing.push(`${file}: .${name}`);
      }
    }
    expect(seen).toBeGreaterThan(50);
    expect(missing).toEqual([]);
  });

  it("13.22 the extractor reads plain, conditional and template class names", () => {
    const names = classNamesIn(
      [
        '<p className="one two" />',
        '<p className={x ? "three" : "four five"} />',
        `<p className={\`six $\{y} seven-$\{z}\`} />`,
      ].join(", "),
    );
    expect(names).toEqual(["one", "two", "three", "four", "five", "six"]);
  });

  it("13.22 the selector match is whole-class, not a prefix", () => {
    expect(hasSelector(".seal__label { color: red }", "seal")).toBe(false);
    expect(hasSelector(".seal__label { color: red }", "seal__label")).toBe(true);
  });
});
