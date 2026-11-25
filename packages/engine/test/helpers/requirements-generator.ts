import fc from "fast-check";

export interface ExpectedCriterion {
  readonly id: string;
  readonly requirement: number;
  readonly criterion: number;
  readonly text: string;
  readonly line: number;
}

export interface GeneratedDocument {
  readonly text: string;
  readonly expected: readonly ExpectedCriterion[];
}

const criterionText = fc
  .array(fc.stringMatching(/^[A-Za-z][A-Za-z0-9,.]{0,8}$/), { minLength: 1, maxLength: 6 })
  .map((words) => words.join(" "));

const title = fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,12}[A-Za-z]$/);

export interface FenceSpec {
  readonly char: "`" | "~";
  readonly length: number;
  /** Indexes into the look-alike line table; the last index is the other fence character. */
  readonly body: readonly number[];
}

const lookAlikes = [
  "### Requirement 99: Fake",
  "#### Acceptance Criteria",
  "#### Notes",
  "# Fake heading",
  "1. Fake item one",
  "2. Fake item two",
  "OTHER",
] as const;

const fenceSpec: fc.Arbitrary<FenceSpec> = fc.record({
  char: fc.constantFrom<"`" | "~">("`", "~"),
  length: fc.integer({ min: 3, max: 5 }),
  body: fc.array(fc.integer({ min: 0, max: lookAlikes.length - 1 }), { maxLength: 6 }),
});

function fenceLines(fence: FenceSpec): string[] {
  const open = fence.char.repeat(fence.length);
  const other = (fence.char === "`" ? "~" : "`").repeat(3);
  const body = fence.body.map((i) => {
    const line = lookAlikes[i] ?? "";
    return line === "OTHER" ? other : line;
  });
  return ["", open, ...body, open, ""];
}

/**
 * Document with `requirements` requirements of `criteria` criteria each, plus filler prose.
 * Optional `fences` are consumed in order after each `#### Acceptance Criteria` heading and
 * after each criterion line; their contents must never be parsed.
 */
export function buildDocument(
  requirements: number,
  criteria: number,
  texts: readonly string[],
  titles: readonly string[],
  newline: "\n" | "\r\n",
  fences: readonly (FenceSpec | null | undefined)[] = [],
): GeneratedDocument {
  let f = 0;
  const addFence = (target: string[]): void => {
    const fence = fences[f++];
    if (fence) target.push(...fenceLines(fence));
  };
  const lines: string[] = [
    "# Requirements Document",
    "",
    "## Introduction",
    "",
    "1. Not a criterion.",
  ];
  const expected: ExpectedCriterion[] = [];
  let t = 0;
  for (let n = 1; n <= requirements; n++) {
    lines.push("", `### Requirement ${n}: ${titles[(n - 1) % titles.length] ?? "T"}`, "");
    lines.push("**User Story:** As a user, I want things.", "", "#### Acceptance Criteria", "");
    addFence(lines);
    for (let k = 1; k <= criteria; k++) {
      const text = texts[t++ % texts.length] ?? "X";
      lines.push(`${k}. ${text}`);
      expected.push({ id: `${n}.${k}`, requirement: n, criterion: k, text, line: lines.length });
      addFence(lines);
    }
  }
  return { text: lines.join(newline), expected };
}

export const requirementsDocument: fc.Arbitrary<GeneratedDocument> = fc
  .record({
    requirements: fc.integer({ min: 1, max: 8 }),
    criteria: fc.integer({ min: 1, max: 8 }),
    texts: fc.array(criterionText, { minLength: 1, maxLength: 10 }),
    titles: fc.array(title, { minLength: 1, maxLength: 4 }),
    newline: fc.constantFrom<"\n" | "\r\n">("\n", "\r\n"),
    fences: fc.array(fc.option(fenceSpec), { maxLength: 80 }),
  })
  .map(({ requirements, criteria, texts, titles, newline, fences }) =>
    buildDocument(requirements, criteria, texts, titles, newline, fences),
  );

/** Documents that contain no numbered item under an `#### Acceptance Criteria` heading. */
export const documentWithoutCriteria: fc.Arbitrary<string> = fc
  .record({
    requirements: fc.integer({ min: 0, max: 5 }),
    withCriteriaHeading: fc.boolean(),
    stray: fc.boolean(),
    titles: fc.array(title, { minLength: 1, maxLength: 3 }),
  })
  .map(({ requirements, withCriteriaHeading, stray, titles }) => {
    const lines = ["# Requirements Document", "", "1. Intro item, not a criterion."];
    for (let n = 1; n <= requirements; n++) {
      lines.push("", `### Requirement ${n}: ${titles[(n - 1) % titles.length] ?? "T"}`, "");
      if (withCriteriaHeading) lines.push("#### Acceptance Criteria", "");
      if (stray) lines.push("#### Notes", "", "1. Item outside the criteria section.");
    }
    return lines.join("\n");
  });
