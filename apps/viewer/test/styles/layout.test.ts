import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const viewerRoot = join(here, "..", "..");
const css = readFileSync(join(viewerRoot, "src", "styles", "layout.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const mainSource = readFileSync(join(viewerRoot, "src", "main.tsx"), "utf8");

interface Rule {
  selector: string;
  body: string;
}

/** Returns the rules inside the first block opened by the given at-rule prelude. */
function atRuleBlock(source: string, prelude: RegExp): string | null {
  const match = prelude.exec(source);
  if (match === null) {
    return null;
  }
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    i += 1;
  }
  return source.slice(start, i - 1);
}

function rulesOf(source: string): Rule[] {
  const rules: Rule[] = [];
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selector: (m[1] ?? "").trim(), body: m[2] ?? "" });
  }
  return rules;
}

describe("layout styles", () => {
  it("11.2 a max-width: 767px media rule exists", () => {
    expect(atRuleBlock(css, /@media[^{]*max-width:\s*767px[^{]*\{/)).not.toBeNull();
  });

  it("11.2 the narrow rule starts at 360px or applies below it", () => {
    const narrow = atRuleBlock(css, /@media[^{]*max-width:\s*767px[^{]*\{/) ?? "";
    expect(narrow).toMatch(/grid-template-columns\s*:\s*(1fr|minmax\(0,\s*1fr\))/);
  });

  it("11.2 .table-scroll has overflow-x: auto", () => {
    const rule = rulesOf(css).find((r) =>
      r.selector.split(",").some((s) => s.trim() === ".table-scroll"),
    );
    expect(rule).toBeDefined();
    expect(rule?.body).toMatch(/overflow-x\s*:\s*auto/);
  });

  it("11.2 .table-scroll does not grow wider than its parent", () => {
    const rule = rulesOf(css).find((r) =>
      r.selector.split(",").some((s) => s.trim() === ".table-scroll"),
    );
    expect(rule?.body).toMatch(/max-width\s*:\s*100%/);
  });

  it("11.2 grid and flex children may shrink with min-width: 0", () => {
    expect(css).toMatch(/min-width\s*:\s*0/);
  });

  it("11.2 long words wrap", () => {
    expect(css).toMatch(/overflow-wrap\s*:\s*(anywhere|break-word)/);
  });

  it("11.2 the page root has no fixed width above 360px", () => {
    const roots = new Set(["html", "body", "#root", ".app"]);
    for (const rule of rulesOf(css)) {
      const targets = rule.selector.split(",").map((s) => s.trim());
      if (!targets.some((s) => roots.has(s))) continue;
      for (const decl of rule.body.matchAll(/(?:^|[;\s])(width|min-width)\s*:\s*([\d.]+)px/g)) {
        expect(Number(decl[2]), `${rule.selector} ${decl[1]}`).toBeLessThanOrEqual(360);
      }
    }
  });

  it("11.2 no width declaration inside the narrow media rule exceeds 360px", () => {
    const narrow = atRuleBlock(css, /@media[^{]*max-width:\s*767px[^{]*\{/) ?? "";
    for (const decl of narrow.matchAll(/(?:^|[;\s{])(width|min-width)\s*:\s*([\d.]+)px/g)) {
      expect(Number(decl[2])).toBeLessThanOrEqual(360);
    }
  });

  it("11.1 a min-width: 1024px media rule defines the desktop layout", () => {
    expect(atRuleBlock(css, /@media[^{]*min-width:\s*1024px[^{]*\{/)).not.toBeNull();
  });

  it("11.1 main.tsx imports layout.css", () => {
    expect(mainSource).toMatch(/import\s+"\.\/styles\/layout\.css"/);
  });
});
