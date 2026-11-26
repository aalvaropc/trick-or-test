import { err, ok, type Result } from "./result.js";
import type { Criterion, CriterionId } from "./types.js";

export type ParseError =
  | { kind: "duplicate-id"; filePath: string; id: string; lines: [number, number]; message: string }
  | { kind: "orphan-criterion"; filePath: string; line: number; message: string }
  | { kind: "no-criteria"; filePath: string; message: string }
  | {
      kind: "duplicate-requirement";
      filePath: string;
      requirement: number;
      lines: [number, number];
      message: string;
    }
  | { kind: "empty-title"; filePath: string; requirement: number; line: number; message: string };

const REQUIREMENT_HEADING = /^###\s+Requirement\s+(\d+)\s*:/;
const CRITERIA_HEADING = /^####\s+Acceptance Criteria\s*$/;
const ANY_HEADING = /^#{1,6}\s/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const NUMBERED_ITEM = /^(\d+)\.\s+(.*\S)\s*$/;

/**
 * Extracts the numbered acceptance criteria of a Kiro `requirements.md` (Requirement 2).
 * Pure line-oriented scan; the caller reads the file.
 */
export function parseRequirements(text: string, filePath: string): Result<Criterion[], ParseError> {
  const criteria: Criterion[] = [];
  const lineOfId = new Map<string, number>();
  let requirement: number | undefined;
  let inCriteria = false;
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
      // A backtick fence's info string cannot contain backticks (CommonMark).
      if (!(run.startsWith("`") && (fenceMatch[2] ?? "").includes("`"))) {
        fence = { char: run.charAt(0), length: run.length };
        continue;
      }
    }

    if (ANY_HEADING.test(raw)) {
      const heading = REQUIREMENT_HEADING.exec(raw);
      if (heading !== null) {
        requirement = Number(heading[1]);
        inCriteria = false;
      } else if (CRITERIA_HEADING.test(raw)) {
        inCriteria = true;
      } else {
        inCriteria = false;
        if (/^###\s/.test(raw) || /^#{1,2}\s/.test(raw)) requirement = undefined;
      }
      continue;
    }

    if (!inCriteria) continue;
    const item = NUMBERED_ITEM.exec(raw);
    if (item === null) continue;

    if (requirement === undefined) {
      return err({
        kind: "orphan-criterion",
        filePath,
        line,
        message: `${filePath}:${line}: numbered item under "Acceptance Criteria" has no enclosing "### Requirement N:" heading`,
      });
    }
    const criterion = Number(item[1]);
    const id = `${requirement}.${criterion}`;
    const first = lineOfId.get(id);
    if (first !== undefined) {
      return err({
        kind: "duplicate-id",
        filePath,
        id,
        lines: [first, line],
        message: `${filePath}: duplicate criterion ${id} at lines ${first} and ${line}`,
      });
    }
    lineOfId.set(id, line);
    criteria.push({
      id: id as CriterionId,
      requirement,
      criterion,
      text: item[2] ?? "",
      line,
    });
  }

  if (criteria.length === 0) {
    return err({
      kind: "no-criteria",
      filePath,
      message: `${filePath}: no acceptance criteria found`,
    });
  }
  return ok(criteria);
}
