// Property 33: Requirement titles. Validates: Requirements 2.2, 2.9, 2.10, 8.26
import fc from "fast-check";
import { describe, it } from "vitest";
import { parseRequirementTitles } from "../../src/core/requirement-titles.js";
import { parseRequirements } from "../../src/core/requirements.js";
import {
  buildDocument,
  type FenceSpec,
  type GeneratedDocument,
} from "../helpers/requirements-generator.js";

const fenceSpec: fc.Arbitrary<FenceSpec> = fc.record({
  char: fc.constantFrom<"`" | "~">("`", "~"),
  length: fc.integer({ min: 3, max: 5 }),
  body: fc.array(fc.integer({ min: 0, max: 6 }), { maxLength: 6 }),
});

// A title core: Unicode, no line terminators, no leading or trailing whitespace.
const titleCore = fc
  .string({ unit: "grapheme", minLength: 1, maxLength: 10 })
  .filter((s) => s.trim() === s && s !== "" && !/[\r\n\u2028\u2029\u0085]/.test(s));

// Optionally add a colon inside the title.
const titleBody = fc
  .tuple(titleCore, fc.option(titleCore))
  .map(([a, b]) => (b === null ? a : `${a}: ${b}`));

const padding = fc.stringMatching(/^[ \t]{0,3}$/);

const paddedTitle = fc
  .tuple(padding, titleBody, padding)
  .map(([left, core, right]) => ({ raw: `${left}${core}${right}`, trimmed: core }));

const scenario = fc.record({
  titles: fc.array(paddedTitle, { minLength: 1, maxLength: 8 }),
  criteria: fc.integer({ min: 1, max: 4 }),
  newline: fc.constantFrom<"\n" | "\r\n">("\n", "\r\n"),
  fences: fc.array(fc.option(fenceSpec), { maxLength: 80 }),
  file: fc.stringMatching(/^[a-z]{1,8}\.md$/),
});

const TEXTS = ["The system shall work", "It does thing"];

function build(
  s: { titles: { raw: string }[]; criteria: number; newline: "\n" | "\r\n" },
  fences: Parameters<typeof buildDocument>[5],
): GeneratedDocument {
  return buildDocument(
    s.titles.length,
    s.criteria,
    TEXTS,
    s.titles.map((t) => t.raw),
    s.newline,
    fences,
  );
}

describe("Property 33: Requirement titles", () => {
  it("2.9 returns one trimmed title per requirement in document order, ignoring fenced look-alikes", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const doc = build(s, s.fences);
        const result = parseRequirementTitles(doc.text, s.file);
        if (!result.ok) return false;
        return (
          result.value.length === s.titles.length &&
          result.value.every(
            (entry, i) => entry.requirement === i + 1 && entry.title === s.titles[i]?.trimmed,
          )
        );
      }),
    );
  });

  it("2.2 parseRequirements returns the same criteria with or without the fenced lines", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const withFences = parseRequirements(build(s, s.fences).text, s.file);
        const without = parseRequirements(build(s, []).text, s.file);
        if (!withFences.ok || !without.ok) return false;
        const strip = (list: typeof withFences.value) =>
          list.map(({ id, requirement, criterion, text }) => ({
            id,
            requirement,
            criterion,
            text,
          }));
        return JSON.stringify(strip(withFences.value)) === JSON.stringify(strip(without.value));
      }),
    );
  });

  it("2.10 a repeated requirement number is an error that names the file and the number", () => {
    fc.assert(
      fc.property(scenario, fc.nat(), (s, pick) => {
        const repeated = (pick % s.titles.length) + 1;
        const doc = build(s, s.fences);
        const text = `${doc.text}${s.newline}${s.newline}### Requirement ${repeated}: Again`;
        const result = parseRequirementTitles(text, s.file);
        return (
          !result.ok &&
          result.error.kind === "duplicate-requirement" &&
          result.error.message.includes(s.file) &&
          result.error.message.includes(`requirement ${repeated}`)
        );
      }),
    );
  });

  it("2.10 an empty title is an error that names the file and the number", () => {
    fc.assert(
      fc.property(scenario, padding, (s, spaces) => {
        const doc = build(s, s.fences);
        const next = s.titles.length + 1;
        const text = `${doc.text}${s.newline}${s.newline}### Requirement ${next}:${spaces}`;
        const result = parseRequirementTitles(text, s.file);
        return (
          !result.ok &&
          result.error.kind === "empty-title" &&
          result.error.message.includes(s.file) &&
          result.error.message.includes(`Requirement ${next}`)
        );
      }),
    );
  });
});
