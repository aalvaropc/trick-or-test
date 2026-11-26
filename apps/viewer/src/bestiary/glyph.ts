import type { Species } from "trick-or-test/report";

const UNKNOWN = "?";

const COMPARISON = /===|!==|==|!=|<=|>=|<|>/;
const ARITHMETIC = /\+\+|--|\*\*=?|[+\-*/%]=|[+\-*/%]|!|~/;
const TWO_FACE = /&&|\|\||\btrue\b|\bfalse\b/;
const CALL_NAME = /([A-Za-z_$][\w$]*)\s*\(/;
const CRITERION_ID = /\b\d+\.\d+\b/;

function present(text: string | undefined): text is string {
  return typeof text === "string" && text.trim() !== "";
}

/** First match of `pattern` in the replacement, else in the original. */
function firstToken(
  pattern: RegExp,
  original: string | undefined,
  replacement: string | undefined,
): string {
  for (const text of [replacement, original]) {
    if (present(text)) {
      const match = pattern.exec(text);
      if (match) return match[0];
    }
  }
  return UNKNOWN;
}

function hollowGlyph(original: string | undefined, replacement: string | undefined): string {
  for (const text of [replacement, original]) {
    if (!present(text)) continue;
    if (text.includes("[")) return "[]";
    if (text.includes("{")) return "{}";
    if (/["'`]/.test(text)) return '""';
  }
  return UNKNOWN;
}

function callName(text: string | undefined): string | undefined {
  return present(text) ? CALL_NAME.exec(text)?.[1] : undefined;
}

function impostorGlyph(original: string | undefined, replacement: string | undefined): string {
  const from = callName(original);
  const to = callName(replacement);
  if (from !== undefined && to !== undefined) return `${from} → ${to}`;
  if (present(original) && present(replacement))
    return `${original.trim()} → ${replacement.trim()}`;
  return UNKNOWN;
}

/**
 * Glyph text (before XML escaping) for the exact code change of a mutant.
 * For Oathbreaker the caller passes the criterion id as `replacement` (or `original`).
 * Returns "?" when both texts are missing or empty, or no glyph is found. Never throws.
 */
export function glyphFor(
  species: Species,
  original: string | undefined,
  replacement: string | undefined,
): string {
  try {
    if (!present(original) && !present(replacement)) return UNKNOWN;
    switch (species) {
      case "Borderling":
        return firstToken(COMPARISON, original, replacement);
      case "Miscount":
        return firstToken(ARITHMETIC, original, replacement);
      case "Two-Face":
        return firstToken(TWO_FACE, original, replacement);
      case "Hollow":
        return hollowGlyph(original, replacement);
      case "Impostor":
        return impostorGlyph(original, replacement);
      case "Oathbreaker":
        return firstToken(CRITERION_ID, original, replacement);
      default:
        return UNKNOWN;
    }
  } catch {
    return UNKNOWN;
  }
}
