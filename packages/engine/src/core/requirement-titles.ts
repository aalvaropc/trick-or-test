import type { ParseError } from "./requirements.js";
import { err, ok, type Result } from "./result.js";
import type { RequirementTitle } from "./types.js";

export type { RequirementTitle };

const TITLE_HEADING = /^###\s+Requirement\s+(\d+)\s*:(.*)$/;
// Same fence rule as `parseRequirements` (CommonMark fenced code blocks).
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Extracts the `### Requirement N: <title>` headings of a Kiro `requirements.md`
 * (Requirements 2.9, 2.10). Pure line-oriented scan; the caller reads the file.
 */
export function parseRequirementTitles(
  text: string,
  filePath: string,
): Result<RequirementTitle[], ParseError> {
  const titles: RequirementTitle[] = [];
  const lineOfRequirement = new Map<number, number>();
  let fence: { char: string; length: number } | undefined;

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] ?? "";
    const line = index + 1;

    const fenceMatch = FENCE.exec(raw);
    if (fence !== undefined) {
      const run = fenceMatch?.[1] ?? "";
      const closes =
        fenceMatch !== null &&
        run.startsWith(fence.char) &&
        run.length >= fence.length &&
        (fenceMatch[2] ?? "").trim() === "";
      if (closes) fence = undefined;
      continue;
    }
    if (fenceMatch !== null) {
      const run = fenceMatch[1] ?? "";
      if (!(run.startsWith("`") && (fenceMatch[2] ?? "").includes("`"))) {
        fence = { char: run.charAt(0), length: run.length };
        continue;
      }
    }

    const heading = TITLE_HEADING.exec(raw);
    if (heading === null) continue;

    const requirement = Number(heading[1]);
    const title = (heading[2] ?? "").trim();
    if (title === "") {
      return err({
        kind: "empty-title",
        filePath,
        requirement,
        line,
        message: `${filePath}:${line}: "### Requirement ${requirement}:" heading has an empty title`,
      });
    }
    const first = lineOfRequirement.get(requirement);
    if (first !== undefined) {
      return err({
        kind: "duplicate-requirement",
        filePath,
        requirement,
        lines: [first, line],
        message: `${filePath}: duplicate requirement ${requirement} at lines ${first} and ${line}`,
      });
    }
    lineOfRequirement.set(requirement, line);
    titles.push({ requirement, title });
  }
  return ok(titles);
}
