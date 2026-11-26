import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const viewerRoot = join(here, "..", "..");
export const srcRoot = join(viewerRoot, "src");
export const stylesRoot = join(srcRoot, "styles");

/** Every file under a directory, as paths relative to it, in a stable order. */
export function listFiles(dir: string, base: string = dir): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFiles(full, base));
    } else {
      found.push(full.slice(base.length + 1));
    }
  }
  return found;
}

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The style sheets under `src/styles/`, comments removed, keyed by file name. */
export function readStyleSheets(): Record<string, string> {
  const sheets: Record<string, string> = {};
  for (const name of listFiles(stylesRoot).filter((f) => f.endsWith(".css"))) {
    sheets[name] = stripComments(readFileSync(join(stylesRoot, name), "utf8"));
  }
  return sheets;
}

export type CssRule = {
  /** The enclosing at-rule preludes, outermost first (for example `@media (min-width: 768px)`). */
  context: string[];
  selector: string;
  declarations: Record<string, string>;
};

/** A small CSS parser: style rules, with `@media` blocks nested to any depth. */
export function parseRules(css: string, context: string[] = []): CssRule[] {
  const rules: CssRule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth += 1;
      if (css[j] === "}") depth -= 1;
      j += 1;
    }
    const body = css.slice(open + 1, j - 1);
    if (prelude.startsWith("@")) {
      rules.push(...parseRules(body, [...context, prelude.replace(/\s+/g, " ")]));
    } else if (prelude.length > 0) {
      const declarations: Record<string, string> = {};
      for (const part of body.split(";")) {
        const colon = part.indexOf(":");
        if (colon === -1) continue;
        declarations[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
      }
      for (const selector of prelude.split(",")) {
        rules.push({ context, selector: selector.trim().replace(/\s+/g, " "), declarations });
      }
    }
    i = j;
  }
  return rules;
}

/** The string literals inside one `className` value. Template literals keep their static parts. */
function literalsOf(expression: string): string[] {
  const out: string[] = [];
  for (const m of expression.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
    // A class built from a placeholder (`count--${x}`) is not a literal name: drop that token.
    const text =
      m[1] ??
      m[2] ??
      (m[3] ?? "")
        .replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, "\u0000")
        .split(/\s+/)
        .filter((token) => !token.includes("\u0000"))
        .join(" ");
    out.push(text);
  }
  return out;
}

/** Class names used in `className="..."` and `className={...}` of one source file. */
export function classNamesIn(source: string): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(/className\s*=\s*/g)) {
    const start = m.index + m[0].length;
    if (source[start] === '"') {
      const end = source.indexOf('"', start + 1);
      names.push(...literalsOf(source.slice(start, end + 1)));
    } else if (source[start] === "{") {
      let depth = 1;
      let i = start + 1;
      while (i < source.length && depth > 0) {
        if (source[i] === "{") depth += 1;
        if (source[i] === "}") depth -= 1;
        i += 1;
      }
      names.push(...literalsOf(source.slice(start + 1, i - 1)));
    }
  }
  return names.flatMap((n) => n.split(/\s+/)).filter((n) => n.length > 0);
}

/** True when some selector of the style sheets contains `.name` as a whole class. */
export function hasSelector(css: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\.${escaped}(?![\\w-])`).test(css);
}

type InlineStyleUse = { file: string; line: number; marked: boolean };

/** A JSX style attribute, a write to `element.style`, or `setAttribute("style", ...)`. */
const INLINE_STYLE =
  /\sstyle=[{"]|\.style\.\w+\s*=[^=]|\.style\.setProperty|setAttribute\(\s*["']style["']/;

/** Where a source sets an inline style, and whether a `runtime-style` comment sits right above it. */
export function inlineStyleUses(file: string, source: string): InlineStyleUse[] {
  const lines = source.split("\n");
  const uses: InlineStyleUse[] = [];
  lines.forEach((text, index) => {
    if (!INLINE_STYLE.test(text)) return;
    const above = lines[index - 1] ?? "";
    uses.push({ file, line: index + 1, marked: /runtime-style:\s*\S/.test(above) });
  });
  return uses;
}
