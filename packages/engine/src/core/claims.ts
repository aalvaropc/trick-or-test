/**
 * Claim reading. Pure functions over strings, no `node:` imports.
 */

import type { BaselineTest, Claim, ClaimCounts, Criterion, MutantResult, TestId } from "./types.js";

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
    const marked = /^(.*\.\d+)[.;:)\]]+$/.exec(token);
    const id = marked?.[1] ?? token;
    if (!TOKEN.test(id)) break;
    refs.push(
      id.includes(".") ? { kind: "criterion", id } : { kind: "requirement", number: Number(id) },
    );
    if (marked) break;
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

/**
 * Requirement 11.11. A Spec_Mutant is valid when its status is Killed,
 * Survived or Timeout (7.6). The Coverage_Status of the criterion is not used.
 */
export function computeClaimOutcome(
  testId: TestId,
  criterionId: string,
  criteria: Criterion[],
  results: MutantResult[],
): Claim {
  if (!criteria.some((item) => item.id === criterionId)) {
    return { criterion: criterionId, outcome: "unknown-criterion" };
  }
  const valid = results.filter(
    (result) =>
      result.requirement === criterionId &&
      (result.status === "Killed" || result.status === "Survived" || result.status === "Timeout"),
  );
  if (valid.length === 0) return { criterion: criterionId, outcome: "unchecked" };
  if (valid.every((result) => result.status === "Killed" && result.killingTests.includes(testId))) {
    return { criterion: criterionId, outcome: "held" };
  }
  const otherTestsKilledAll = valid.every(
    (result) =>
      result.status === "Timeout" ||
      (result.status === "Killed" && result.killingTests.some((id) => id !== testId)),
  );
  return { criterion: criterionId, outcome: "not-held", otherTestsKilledAll };
}

/**
 * Adds the claims to each Baseline_Test and sums the counts. A test with no
 * claim ids gets no `claims` key.
 */
export function attachClaims(
  tests: BaselineTest[],
  claimIdsByTest: Map<TestId, string[]>,
  criteria: Criterion[],
  results: MutantResult[],
): { baselineTests: BaselineTest[]; claimCounts: ClaimCounts } {
  const counts: ClaimCounts = {
    total: 0,
    held: 0,
    notHeld: 0,
    unchecked: 0,
    unknownCriterion: 0,
    notHeldOthersKilledAll: 0,
    notHeldOthersDidNot: 0,
  };
  const baselineTests = tests.map((test): BaselineTest => {
    const { claims: _previous, ...rest } = test;
    const ids = claimIdsByTest.get(test.id) ?? [];
    if (ids.length === 0) return rest;
    const claims = ids.map((id) => computeClaimOutcome(test.id, id, criteria, results));
    for (const claim of claims) {
      counts.total += 1;
      if (claim.outcome === "held") counts.held += 1;
      else if (claim.outcome === "unchecked") counts.unchecked += 1;
      else if (claim.outcome === "unknown-criterion") counts.unknownCriterion += 1;
      else {
        counts.notHeld += 1;
        if (claim.otherTestsKilledAll) counts.notHeldOthersKilledAll += 1;
        else counts.notHeldOthersDidNot += 1;
      }
    }
    return { ...rest, claims };
  });
  return { baselineTests, claimCounts: counts };
}
