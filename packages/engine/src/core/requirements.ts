import { err, ok, type Result } from "./result.js";
import type { Criterion, CriterionId } from "./types.js";

export type ParseError =
  | { kind: "duplicate-id"; filePath: string; id: string; lines: [number, number]; message: string }
  | { kind: "orphan-criterion"; filePath: string; line: number; message: string }
  | { kind: "no-criteria"; filePath: string; message: string };

const REQUIREMENT_HEADING = /^###\s+Requirement\s+(\d+)\s*:/;
const CRITERIA_HEADING = /^####\s+Acceptance Criteria\s*$/;
const ANY_HEADING = /^#{1,6}\s/;
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

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] ?? "";
    const line = index + 1;

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
