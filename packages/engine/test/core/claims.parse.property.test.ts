// Property 27: Claim parsing. Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.13
import fc from "fast-check";
import { describe, it } from "vitest";
import {
  type ClaimRef,
  extractLeadingComments,
  parseClaimComments,
  resolveClaimRefs,
} from "../../src/core/claims.js";
import type { Criterion, CriterionId } from "../../src/core/types.js";

const SPEC = "cart-pricing";

// ---------- generators ----------

const word = fc.stringMatching(/^[a-z]{1,8}$/);
const sentence = fc.array(word, { minLength: 1, maxLength: 4 }).map((words) => words.join(" "));

const codeLine = fc.constantFrom("const a = 1;", 'it("x", () => {});', "});", "import x from 'y';");

type Kind = "code" | "blank" | "comment";
type Line = { kind: Kind; text: string };

const noiseLine: fc.Arbitrary<Line> = fc.oneof(
  codeLine.map((text) => ({ kind: "code" as const, text })),
  fc.constant({ kind: "blank" as const, text: "" }),
  fc.constant({ kind: "blank" as const, text: "   " }),
  sentence.map((text) => ({ kind: "comment" as const, text: `// ${text}` })),
);

/** A run of comment lines and the text that `extractLeadingComments` must return for it. */
const commentRun: fc.Arbitrary<{ lines: string[]; expected: string[] }> = fc.oneof(
  fc.array(sentence, { minLength: 1, maxLength: 5 }).map((items) => ({
    lines: items.map((item) => `// ${item}`),
    expected: items,
  })),
  fc.array(sentence, { minLength: 1, maxLength: 5 }).map((items) => ({
    lines: ["/*", ...items.map((item) => ` * ${item}`), " */"],
    expected: ["", ...items, ""],
  })),
  sentence.map((item) => ({ lines: [`/* ${item} */`], expected: [item] })),
);

const separator = fc.constantFrom<Line>(
  { kind: "blank", text: "" },
  { kind: "code", text: "const a = 1;" },
  { kind: "code", text: 'describe("d", () => {' },
);

const id = fc.integer({ min: 1, max: 9 });
const claimRef: fc.Arbitrary<ClaimRef> = fc.oneof(
  fc.tuple(id, id).map(([n, m]): ClaimRef => ({ kind: "criterion", id: `${n}.${m}` })),
  id.map((n): ClaimRef => ({ kind: "requirement", number: n })),
);

const refToken = (ref: ClaimRef): string =>
  ref.kind === "criterion" ? ref.id : String(ref.number);

const malformed = fc.constantFrom("5.1-5.3", "5.", "x", "1.2.3", "abc", "1.");

const idSeparator = fc.constantFrom(", ", " ", " and ", ",", " , ", "  ", " AND ", ", and ");

type Variant = {
  validates: string;
  requirements: string;
  prefix: string;
  bold: boolean;
  separators: string[];
};

const variant: fc.Arbitrary<Variant> = fc.record({
  validates: fc.constantFrom("Validates:", "validates:", "VALIDATES:"),
  requirements: fc.constantFrom("Requirement", "Requirements", "requirements", "REQUIREMENT"),
  prefix: fc.constantFrom("", " ", "* ", "** ", "// "),
  bold: fc.boolean(),
  separators: fc.array(idSeparator, { minLength: 8, maxLength: 8 }),
});

function render(refs: ClaimRef[], tail: string[], v: Variant): string {
  const tokens = [...refs.map(refToken), ...tail];
  let body = "";
  tokens.forEach((token, index) => {
    body += index === 0 ? token : (v.separators[index % v.separators.length] ?? ", ") + token;
  });
  const core = `${v.validates} ${v.requirements} ${body}`;
  return v.bold ? `${v.prefix}**${core}**` : `${v.prefix}${core}`;
}

const refList = fc.array(claimRef, { minLength: 0, maxLength: 6 });

function criterion(requirement: number, index: number): Criterion {
  return {
    id: `${requirement}.${index}` as CriterionId,
    requirement,
    criterion: index,
    text: `text ${requirement}.${index}`,
    line: requirement * 10 + index,
  };
}

/** Criteria for a subset of requirements 1..6, in document order. */
const criteriaList: fc.Arbitrary<Criterion[]> = fc
  .array(fc.integer({ min: 0, max: 4 }), { minLength: 6, maxLength: 6 })
  .map((counts) =>
    counts.flatMap((count, index) =>
      Array.from({ length: count }, (_, k) => criterion(index + 1, k + 1)),
    ),
  );

// ---------- extractLeadingComments ----------

describe("Property 27: Claim parsing", () => {
  it("11.1 returns exactly the unbroken run of comment lines above the start line, in file order", () => {
    fc.assert(
      fc.property(
        fc.array(noiseLine, { maxLength: 6 }),
        separator,
        commentRun,
        fc.array(noiseLine, { maxLength: 3 }),
        (before, sep, run, after) => {
          const lines = [
            ...before.map((l) => l.text),
            sep.text,
            ...run.lines,
            'it("x", () => {});',
            ...after.map((l) => l.text),
          ];
          const startLine = before.length + 1 + run.lines.length + 1;
          const got = extractLeadingComments(lines.join("\n"), startLine);
          return JSON.stringify(got) === JSON.stringify(run.expected);
        },
      ),
    );
  });

  it("11.1 returns nothing when the line above the start line is blank or code", () => {
    fc.assert(
      fc.property(
        fc.array(noiseLine, { maxLength: 6 }),
        separator,
        fc.array(noiseLine, { maxLength: 3 }),
        (before, sep, after) => {
          const lines = [
            ...before.map((l) => l.text),
            sep.text,
            'it("x", () => {});',
            ...after.map((l) => l.text),
          ];
          return extractLeadingComments(lines.join("\n"), before.length + 2).length === 0;
        },
      ),
    );
  });

  it("11.1 returns nothing for a start line of 1 or less, or beyond the text", () => {
    fc.assert(
      fc.property(
        fc.array(noiseLine, { minLength: 1, maxLength: 8 }),
        fc.integer({ min: -5, max: 1 }),
        fc.integer({ min: 1, max: 5 }),
        (lines, low, extra) => {
          const text = lines.map((l) => l.text).join("\n");
          return (
            extractLeadingComments(text, low).length === 0 &&
            extractLeadingComments(text, lines.length + extra).length === 0
          );
        },
      ),
    );
  });

  it("11.1 for any file and start line, the result is empty when the line above is not a comment and never longer than the lines above", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            noiseLine,
            commentRun.map((r) => ({ kind: "comment" as const, text: r.lines.join("\n") })),
          ),
          {
            minLength: 1,
            maxLength: 10,
          },
        ),
        fc.integer({ min: -2, max: 14 }),
        (items, startLine) => {
          const text = items.map((l) => l.text).join("\n");
          const got = extractLeadingComments(text, startLine);
          const physical = text.split("\n");
          if (startLine <= 1 || startLine > physical.length) return got.length === 0;
          const above = (physical[startLine - 2] ?? "").trim();
          const isComment =
            above.startsWith("//") ||
            above.startsWith("/*") ||
            above.startsWith("*") ||
            above.endsWith("*/");
          if (!isComment) return got.length === 0;
          return got.length >= 1 && got.length <= startLine - 1;
        },
      ),
    );
  });

  it("11.8 a comment above a describe is not returned for a test inside the block", () => {
    fc.assert(
      fc.property(commentRun, (run) => {
        const lines = [...run.lines, 'describe("d", () => {', '  it("x", () => {});', "});"];
        const describeLine = run.lines.length + 1;
        return (
          extractLeadingComments(lines.join("\n"), describeLine + 1).length === 0 &&
          JSON.stringify(extractLeadingComments(lines.join("\n"), describeLine)) ===
            JSON.stringify(run.expected)
        );
      }),
    );
  });

  it("11.9 two tests generated by one each call get the same ids", () => {
    fc.assert(
      fc.property(
        commentRun,
        fc.constantFrom("it.each", "test.each"),
        refList.filter((refs) => refs.length > 0),
        variant,
        criteriaList,
        (run, call, refs, v, criteria) => {
          const annotation = `// ${render(refs, [], { ...v, prefix: "", bold: false })}`;
          const lines = [
            annotation,
            ...run.lines,
            `${call}([1, 2])(`,
            '  "case %s",',
            "  (n) => {},",
            ");",
          ];
          const startLine = 1 + run.lines.length + 1;
          const text = lines.join("\n");
          const idsFor = (): string[] =>
            resolveClaimRefs(
              parseClaimComments(extractLeadingComments(text, startLine), SPEC),
              criteria,
            );
          const first = idsFor();
          const second = idsFor();
          return first.length > 0 && JSON.stringify(first) === JSON.stringify(second);
        },
      ),
    );
  });

  // ---------- parseClaimComments ----------

  it("11.2 a Feature line that names another spec gives no refs, wherever the other lines stand", () => {
    fc.assert(
      fc.property(
        word.filter((name) => name !== SPEC),
        sentence,
        refList,
        variant,
        fc.array(fc.tuple(fc.nat(), sentence), { maxLength: 5 }),
        fc.boolean(),
        (other, rest, refs, v, noise, featureFirst) => {
          const feature = `Feature: ${other}, ${rest}`;
          const validates = render(refs, [], v);
          const lines = featureFirst ? [feature, validates] : [validates, feature];
          for (const [position, text] of noise) {
            lines.splice(position % (lines.length + 1), 0, `note ${text}`);
          }
          return parseClaimComments(lines, SPEC).length === 0;
        },
      ),
    );
  });

  it("11.3 11.7 11.10 the refs are the ids before the first malformed token, whatever other comment lines stand around, with or without a Feature line naming this spec", () => {
    fc.assert(
      fc.property(
        refList,
        fc.option(malformed, { nil: undefined }),
        fc.array(claimRef, { maxLength: 3 }),
        variant,
        fc.constantFrom<"none" | "same" | "same-with-tail">("none", "same", "same-with-tail"),
        fc.array(fc.tuple(fc.nat(), sentence), { maxLength: 5 }),
        fc.boolean(),
        (refs, bad, ignored, v, featureMode, noise, featureFirst) => {
          const tail = bad === undefined ? [] : [bad, ...ignored.map(refToken)];
          const validates = render(refs, tail, v);
          const lines: string[] = [];
          if (featureMode === "none") lines.push(validates);
          else {
            const feature =
              featureMode === "same" ? `Feature: ${SPEC}` : `Feature: ${SPEC}, Property 9: x, y`;
            lines.push(...(featureFirst ? [feature, validates] : [validates, feature]));
          }
          for (const [position, text] of noise) {
            lines.splice(position % (lines.length + 1), 0, `note ${text}`);
          }
          const got = parseClaimComments(lines, SPEC);
          return JSON.stringify(got) === JSON.stringify(refs);
        },
      ),
    );
  });

  it("11.3 the same refs in two different spacing, comma, and and ** variants give the same ids", () => {
    fc.assert(
      fc.property(refList, variant, variant, criteriaList, (refs, a, b, criteria) => {
        const idsOf = (v: Variant): string[] =>
          resolveClaimRefs(parseClaimComments([render(refs, [], v)], SPEC), criteria);
        return JSON.stringify(idsOf(a)) === JSON.stringify(idsOf(b));
      }),
    );
  });

  // ---------- resolveClaimRefs ----------

  it("11.4 a whole-requirement ref expands to exactly the criteria of that requirement in document order", () => {
    fc.assert(
      fc.property(criteriaList, fc.integer({ min: 1, max: 6 }), (criteria, n) => {
        const members = criteria.filter((c) => c.requirement === n).map((c) => c.id as string);
        if (members.length === 0) return true;
        return (
          JSON.stringify(resolveClaimRefs([{ kind: "requirement", number: n }], criteria)) ===
          JSON.stringify(members)
        );
      }),
    );
  });

  it("11.5 an id or number that the spec lacks stays as written", () => {
    fc.assert(
      fc.property(criteriaList, id, id, (criteria, n, m) => {
        const known = new Set<string>(criteria.map((c) => c.id));
        const hasRequirement = criteria.some((c) => c.requirement === n);
        const criterionId = `${n}.${m + 10}`;
        const gotCriterion = resolveClaimRefs([{ kind: "criterion", id: criterionId }], criteria);
        const gotRequirement = resolveClaimRefs([{ kind: "requirement", number: n }], criteria);
        return (
          !known.has(criterionId) &&
          JSON.stringify(gotCriterion) === JSON.stringify([criterionId]) &&
          (hasRequirement || JSON.stringify(gotRequirement) === JSON.stringify([String(n)]))
        );
      }),
    );
  });

  it("11.6 the result has no duplicate and keeps the first place of each id", () => {
    fc.assert(
      fc.property(refList, criteriaList, (refs, criteria) => {
        const got = resolveClaimRefs(refs, criteria);
        const flat = refs.flatMap((ref): string[] => {
          if (ref.kind === "criterion") return [ref.id];
          const members = criteria.filter((c) => c.requirement === ref.number);
          return members.length === 0 ? [String(ref.number)] : members.map((c) => c.id as string);
        });
        const expected = [...new Set(flat)];
        return new Set(got).size === got.length && JSON.stringify(got) === JSON.stringify(expected);
      }),
    );
  });

  it("11.13 the parser is pure: the same inputs give the same output and the inputs are not changed", () => {
    fc.assert(
      fc.property(refList, variant, criteriaList, (refs, v, criteria) => {
        const lines = [render(refs, [], v)];
        const linesBefore = JSON.stringify(lines);
        const criteriaBefore = JSON.stringify(criteria);
        const first = parseClaimComments(lines, SPEC);
        const second = parseClaimComments(lines, SPEC);
        const resolved = resolveClaimRefs(first, criteria);
        return (
          JSON.stringify(first) === JSON.stringify(second) &&
          JSON.stringify(resolved) === JSON.stringify(resolveClaimRefs(second, criteria)) &&
          JSON.stringify(lines) === linesBefore &&
          JSON.stringify(criteria) === criteriaBefore
        );
      }),
    );
  });
});
