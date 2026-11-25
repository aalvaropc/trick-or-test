const OPENERS = "([{";
const CLOSERS = ")]}";
const REGEX_PRECEDERS = "(,=:[!&|?{};+-*%<>~^";
const REGEX_KEYWORDS = new Set([
  "return",
  "typeof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "void",
  "yield",
]);

const isIdentChar = (ch: string | undefined): boolean => ch !== undefined && /[\w$]/.test(ch);

/** Returns the index just past the closing quote of a string starting at `i`. */
const skipString = (s: string, i: number): number => {
  const quote = s[i];
  let j = i + 1;
  while (j < s.length) {
    const ch = s[j];
    if (ch === "\\") j += 2;
    else if (ch === quote) return j + 1;
    else if (ch === "\n") return j;
    else j += 1;
  }
  return s.length;
};

/** Returns the index just past the closing slash and flags of a regex starting at `i`. */
const skipRegex = (s: string, i: number): number => {
  let j = i + 1;
  let inClass = false;
  while (j < s.length) {
    const ch = s[j];
    if (ch === "\\") j += 2;
    else if (ch === "\n") return j;
    else if (ch === "[") {
      inClass = true;
      j += 1;
    } else if (ch === "]") {
      inClass = false;
      j += 1;
    } else if (ch === "/" && !inClass) {
      j += 1;
      while (isIdentChar(s[j])) j += 1;
      return j;
    } else j += 1;
  }
  return s.length;
};

const previousWord = (s: string, end: number): string => {
  let start = end;
  while (start > 0 && isIdentChar(s[start - 1])) start -= 1;
  return s.slice(start, end);
};

const regexAllowedAfter = (s: string, i: number): boolean => {
  let j = i - 1;
  while (j >= 0 && /\s/.test(s[j] as string)) j -= 1;
  if (j < 0) return true;
  const ch = s[j] as string;
  if (isIdentChar(ch)) return REGEX_KEYWORDS.has(previousWord(s, j + 1));
  return REGEX_PRECEDERS.includes(ch);
};

/** Returns the index just past the closing backtick of a template starting at `i`. */
const skipTemplate = (s: string, i: number): number => {
  let j = i + 1;
  while (j < s.length) {
    const ch = s[j];
    if (ch === "\\") j += 2;
    else if (ch === "`") return j + 1;
    else if (ch === "$" && s[j + 1] === "{") j = scan(s, j + 2, true);
    else j += 1;
  }
  return s.length;
};

/**
 * Scans code from `from`. With `inTemplate`, stops after the unmatched `}`.
 * Otherwise stops after the bracket that closes the first opened one.
 * Returns the index just past the stop point, or the text length if unbalanced.
 */
const scan = (s: string, from: number, inTemplate: boolean): number => {
  let depth = 0;
  let opened = false;
  let i = from;
  while (i < s.length) {
    const ch = s[i] as string;
    const next = s[i + 1];
    if (ch === '"' || ch === "'") i = skipString(s, i);
    else if (ch === "`") i = skipTemplate(s, i);
    else if (ch === "/" && next === "/") {
      const nl = s.indexOf("\n", i);
      i = nl === -1 ? s.length : nl;
    } else if (ch === "/" && next === "*") {
      const end = s.indexOf("*/", i + 2);
      i = end === -1 ? s.length : end + 2;
    } else if (ch === "/" && regexAllowedAfter(s, i)) i = skipRegex(s, i);
    else if (OPENERS.includes(ch)) {
      depth += 1;
      opened = true;
      i += 1;
    } else if (CLOSERS.includes(ch)) {
      if (inTemplate && depth === 0) return i + 1;
      depth -= 1;
      i += 1;
      if (!inTemplate && opened && depth <= 0) return i;
    } else i += 1;
  }
  return s.length;
};

/**
 * Returns the text of a test call from the start of the 1-based `startLine`
 * to the bracket that closes the call. Returns "" when the line is past the
 * end of the file.
 */
export const extractTestBody = (fileText: string, startLine: number): string => {
  if (!Number.isInteger(startLine) || startLine < 1) return "";
  let offset = 0;
  for (let line = 1; line < startLine; line += 1) {
    const nl = fileText.indexOf("\n", offset);
    if (nl === -1) return "";
    offset = nl + 1;
  }
  if (offset >= fileText.length) return "";
  return fileText.slice(offset, scan(fileText, offset, false));
};
