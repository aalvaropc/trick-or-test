/**
 * Claim reading. Pure functions over strings, no `node:` imports.
 */

import type { Criterion } from "./types.js";

/** One id read from a `Validates:` line: a criterion `N.M` or a whole requirement `N`. */
export type ClaimRef = { kind: "criterion"; id: string } | { kind: "requirement"; number: number };

const TOKEN = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))?$/;

function cleanLine(line: string): string {
  return line.replace(/^[\s/*]+/, "").trim();
}

function parseIds(rest: string): ClaimRef[] {
  const refs: ClaimRef[] = [];
  for (const token of rest.split(/[\s,]+/)) {
    if (token === "" || token.toLowerCase() === "and") continue;
    if (!TOKEN.test(token)) break;
    refs.push(
      token.includes(".")
        ? { kind: "criterion", id: token }
        : { kind: "requirement", number: Number(token) },
    );
  }
  return refs;
}

/**
 * Reads the claims of one run of comment lines (as returned by
 * `extractLeadingComments`). A `Feature:` line naming another spec gives none.
 */
export function parseClaimComments(lines: string[], specName: string): ClaimRef[] {
  const refs: ClaimRef[] = [];
  for (const raw of lines) {
    const line = cleanLine(raw);
    const feature = /^Feature:\s*([^,]*)/i.exec(line);
    if (feature) {
      if ((feature[1] ?? "").trim() !== specName) return [];
      continue;
    }
    const validates = /^Validates:\s*Requirements?\s+(.*)$/i.exec(line);
    if (validates) refs.push(...parseIds((validates[1] ?? "").replace(/\*+\s*$/, "")));
  }
  return refs;
}

/**
 * Turns refs into criterion id strings. A requirement expands to its criteria
 * in document order; unknown ids stay as written; duplicates keep the first.
 */
export function resolveClaimRefs(refs: ClaimRef[], criteria: Criterion[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const ref of refs) {
    if (ref.kind === "criterion") {
      add(ref.id);
      continue;
    }
    const members = criteria.filter((item) => item.requirement === ref.number);
    if (members.length === 0) add(String(ref.number));
    else for (const member of members) add(member.id);
  }
  return out;
}

function stripMarkers(trimmed: string): string {
  if (trimmed.startsWith("//")) return trimmed.replace(/^\/+/, "").trim();
  return trimmed
    .replace(/^\/\*+/, "")
    .replace(/\*+\/$/, "")
    .replace(/^\s*\*+/, "")
    .trim();
}

function isCommentStart(trimmed: string): boolean {
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*");
}

/**
 * Returns the unbroken run of comment lines that ends on the line before
 * `startLine` (1-based), in file order, with comment markers removed.
 * A blank line or a line of code ends the run.
 */
export function extractLeadingComments(fileText: string, startLine: number): string[] {
  const lines = fileText.split(/\r?\n/);
  if (!Number.isInteger(startLine) || startLine < 2 || startLine > lines.length) return [];
  const found: string[] = [];
  let inBlock = false;
  for (let index = startLine - 2; index >= 0; index -= 1) {
    const trimmed = (lines[index] ?? "").trim();
    if (inBlock) {
      found.push(stripMarkers(trimmed));
      if (trimmed.includes("/*")) inBlock = false;
      continue;
    }
    if (trimmed.startsWith("//")) {
      found.push(stripMarkers(trimmed));
    } else if (trimmed.endsWith("*/")) {
      found.push(stripMarkers(trimmed));
      inBlock = !trimmed.includes("/*");
    } else if (isCommentStart(trimmed)) {
      found.push(stripMarkers(trimmed));
    } else {
      break;
    }
  }
  return found.reverse();
}
