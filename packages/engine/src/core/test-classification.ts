/**
 * Test classification (Requirements 6.3-6.5). A test is a Property_Test when
 * its file path matches a property-test glob (6.3) or its own body calls
 * `fc.assert`, `fc.check` or `test.prop` (6.4). Every other test is an
 * Example_Test (6.5). A test that reaches fast-check only through a helper has
 * no such call in its body, so it is classified by its file glob alone.
 */
export type TestKind = "property" | "example";

/** Characters after which a `/` starts a regular expression literal, not a division. */
const REGEX_PRECEDERS = "(,=:[!&|?{};+-*%<>~^";

const blank = (ch: string): string => (ch === "\n" ? "\n" : " ");

/**
 * Replace comments and the contents of string, template and regular expression
 * literals with spaces, so that mentions inside them cannot match a call.
 */
const blankCommentsAndLiterals = (source: string): string => {
  let out = "";
  let i = 0;
  let lastSignificant = "";
  while (i < source.length) {
    const ch = source.charAt(i);
    const next = source.charAt(i + 1);
    if (ch === "/" && next === "/") {
      while (i < source.length && source.charAt(i) !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < source.length && !(source.charAt(i) === "*" && source.charAt(i + 1) === "/")) {
        out += blank(source.charAt(i));
        i++;
      }
      if (i < source.length) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    const isRegexStart =
      ch === "/" && (lastSignificant === "" || REGEX_PRECEDERS.includes(lastSignificant));
    if (ch === '"' || ch === "'" || ch === "`" || isRegexStart) {
      const quote = ch;
      out += quote;
      i++;
      let inClass = false;
      while (i < source.length) {
        const c = source.charAt(i);
        if (c === "\\") {
          out += ` ${blank(source.charAt(i + 1))}`;
          i += 2;
          continue;
        }
        if (quote === "/") {
          if (c === "[") inClass = true;
          else if (c === "]") inClass = false;
        }
        if (c === quote && !inClass) break;
        if (c === "\n" && quote !== "`") break;
        out += blank(c);
        i++;
      }
      if (source.charAt(i) === quote) {
        out += quote;
        i++;
      }
      lastSignificant = quote;
      continue;
    }
    out += ch;
    if (!/\s/.test(ch)) lastSignificant = ch;
    i++;
  }
  return out;
};

const escapeRegex = (ch: string): string => ch.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");

/** Translate a glob with `**`, `*`, `?` and literal text into an anchored RegExp. */
const globToRegExp = (glob: string): RegExp => {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const ch = glob.charAt(i);
    if (ch === "*" && glob.charAt(i + 1) === "*") {
      if (glob.charAt(i + 2) === "/") {
        re += "(?:.*/)?";
        i += 3;
      } else {
        re += ".*";
        i += 2;
      }
    } else if (ch === "*") {
      re += "[^/]*";
      i++;
    } else if (ch === "?") {
      re += "[^/]";
      i++;
    } else {
      re += escapeRegex(ch);
      i++;
    }
  }
  return new RegExp(`^${re}$`);
};

/**
 * Expand the first top-level `{a,b}` group (recursively, so nested and
 * repeated groups work). A `{` without a matching `}` or without a comma at
 * its own depth is literal.
 */
const expandBraces = (glob: string): string[] => {
  for (let start = glob.indexOf("{"); start !== -1; start = glob.indexOf("{", start + 1)) {
    let depth = 0;
    const commas: number[] = [];
    let end = -1;
    for (let i = start; i < glob.length; i++) {
      const c = glob.charAt(i);
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      } else if (c === "," && depth === 1) commas.push(i);
    }
    if (end === -1 || commas.length === 0) continue;
    const prefix = glob.slice(0, start);
    const suffix = glob.slice(end + 1);
    const bounds = [start, ...commas, end];
    const results: string[] = [];
    for (let k = 0; k < bounds.length - 1; k++) {
      const alt = glob.slice((bounds[k] ?? 0) + 1, bounds[k + 1]);
      results.push(...expandBraces(prefix + alt + suffix));
    }
    return results;
  }
  return [glob];
};

const normalizePath = (p: string): string => p.replace(/\\/g, "/").replace(/^\.\//, "");

/** A call to `fc.assert`, `fc.check` or `test.prop`, optionally with type arguments. */
const PROPERTY_CALL =
  /(?<![\w$.])(?:fc\s*\.\s*(?:assert|check)|test\s*\.\s*prop)\s*(?:<[^()]*>\s*)?\(/;

export const classifyTest = (
  test: { filePath: string; bodySource: string },
  propertyTestGlobs: string[],
): TestKind => {
  const path = normalizePath(test.filePath);
  if (
    propertyTestGlobs.some((glob) =>
      expandBraces(normalizePath(glob)).some((g) => globToRegExp(g).test(path)),
    )
  ) {
    return "property";
  }
  return PROPERTY_CALL.test(blankCommentsAndLiterals(test.bodySource)) ? "property" : "example";
};
