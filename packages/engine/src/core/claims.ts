/**
 * Claim reading. Pure functions over strings, no `node:` imports.
 */

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
