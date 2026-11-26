import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const viewerRoot = join(here, "..", "..");
const stylesDir = join(viewerRoot, "src", "styles");
const bestiaryPath = join(viewerRoot, "..", "..", ".kiro", "steering", "bestiary.md");

const TOKENS = ["ink", "bone", "amber", "verdigris", "mist", "ember"] as const;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function cssFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...cssFiles(full));
    } else if (entry.name.endsWith(".css")) {
      found.push(full);
    }
  }
  return found;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function bestiaryTokenValues(): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of read(bestiaryPath).split("\n")) {
    const match = /^\|\s*`--([a-z]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      values.set(match[1], match[2].toLowerCase());
    }
  }
  return values;
}

function rootDeclarations(css: string): Map<string, string> {
  const declarations = new Map<string, string>();
  const block = /:root\s*\{([^}]*)\}/g;
  for (const rule of stripComments(css).matchAll(block)) {
    for (const decl of (rule[1] ?? "").matchAll(/--([a-z]+)\s*:\s*([^;]+);/g)) {
      if (decl[1] !== undefined && decl[2] !== undefined) {
        declarations.set(decl[1], decl[2].trim().toLowerCase());
      }
    }
  }
  return declarations;
}

describe("design tokens", () => {
  it("10.1 bestiary.md lists the six colour tokens", () => {
    const expected = bestiaryTokenValues();
    expect([...expected.keys()].sort()).toEqual([...TOKENS].sort());
  });

  it("10.1 tokens.css defines each token on :root with the bestiary.md value", () => {
    const expected = bestiaryTokenValues();
    const actual = rootDeclarations(read(join(stylesDir, "tokens.css")));
    for (const token of TOKENS) {
      expect(actual.get(token), `--${token}`).toBe(expected.get(token));
    }
  });
});

describe("base styles", () => {
  const base = stripComments(read(join(stylesDir, "base.css")));

  it("10.9 no CSS file under src uses a gradient, box-shadow or text-shadow", () => {
    const files = cssFiles(join(viewerRoot, "src"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) {
      const css = stripComments(read(file));
      expect(css, file).not.toMatch(/gradient\(/i);
      expect(css, file).not.toMatch(/box-shadow/i);
      expect(css, file).not.toMatch(/text-shadow/i);
    }
  });

  it("10.2 the display font stack is IM Fell English, Georgia, serif", () => {
    expect(base).toContain('"IM Fell English", Georgia, serif');
  });

  it("10.2 the data font stack is JetBrains Mono, ui-monospace, monospace", () => {
    expect(base).toContain('"JetBrains Mono", ui-monospace, monospace');
  });

  it("10.12 data and code use tabular figures", () => {
    expect(base).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it("10.4 no font-size under 14px in any CSS file", () => {
    for (const file of cssFiles(join(viewerRoot, "src"))) {
      const css = stripComments(read(file));
      for (const match of css.matchAll(/font-size\s*:\s*([\d.]+)(px|rem|em)/g)) {
        const size = Number(match[1]);
        const px = match[2] === "px" ? size : size * 16;
        expect(px, `${file}: ${match[0]}`).toBeGreaterThanOrEqual(14);
      }
    }
  });

  it("10.4 base.css sets a base font size", () => {
    expect(base).toMatch(/font-size\s*:\s*[\d.]+(px|rem)/);
  });

  it("10.6 the focus ring outline is at least 2px wide", () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(base);
    expect(rule).not.toBeNull();
    const outline = /outline\s*:\s*([\d.]+)px/.exec(rule?.[1] ?? "");
    expect(outline).not.toBeNull();
    expect(Number(outline?.[1])).toBeGreaterThanOrEqual(2);
  });

  it("10.6 the focus ring uses a token with at least 3:1 contrast on ink", () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(base);
    expect(rule?.[1]).toMatch(/outline\s*:[^;]*var\(--(bone|amber|verdigris)\)/);
  });
});
