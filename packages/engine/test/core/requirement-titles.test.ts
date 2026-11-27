import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRequirementTitles } from "../../src/core/requirement-titles.js";
import { parseRequirements } from "../../src/core/requirements.js";

const FILE = "requirements.md";

const titles = (text: string) => {
  const result = parseRequirementTitles(text, FILE);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

describe("parseRequirementTitles", () => {
  it("2.9 a heading gives the requirement number and its title", () => {
    expect(titles("### Requirement 2: Requirements parser\n")).toEqual([
      { requirement: 2, title: "Requirements parser" },
    ]);
  });

  it("2.9 leading and trailing spaces of the title are trimmed", () => {
    expect(titles("### Requirement 3:   Mechanical mutants   \n")).toEqual([
      { requirement: 3, title: "Mechanical mutants" },
    ]);
  });

  it("2.9 a colon inside the title is kept", () => {
    expect(titles("### Requirement 4: Spec mutants: the Oathbreakers\n")).toEqual([
      { requirement: 4, title: "Spec mutants: the Oathbreakers" },
    ]);
  });

  it("2.9 a heading inside a backtick fence is ignored", () => {
    const text = ["```md", "### Requirement 1: Hidden", "```", "### Requirement 2: Shown"].join(
      "\n",
    );
    expect(titles(text)).toEqual([{ requirement: 2, title: "Shown" }]);
  });

  it("2.9 a heading inside a tilde fence is ignored", () => {
    const text = ["~~~", "### Requirement 1: Hidden", "~~~", "### Requirement 2: Shown"].join("\n");
    expect(titles(text)).toEqual([{ requirement: 2, title: "Shown" }]);
  });

  it("2.9 titles come in document order", () => {
    const text = [
      "### Requirement 5: Five",
      "### Requirement 2: Two",
      "### Requirement 9: Nine",
    ].join("\n");
    expect(titles(text).map((t) => t.requirement)).toEqual([5, 2, 9]);
  });

  it("2.9 a document with no heading gives an empty list", () => {
    expect(titles("# Title\n\nSome text.\n")).toEqual([]);
  });

  it("2.10 a repeated requirement number is an error naming the file, the number and both lines", () => {
    const text = [
      "### Requirement 1: One",
      "",
      "### Requirement 2: Two",
      "### Requirement 1: Again",
    ].join("\n");
    const result = parseRequirementTitles(text, FILE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("duplicate-requirement");
    expect(result.error.message).toContain(FILE);
    expect(result.error.message).toContain("1");
    expect(result.error.message).toContain("1 and 4");
    if (result.error.kind === "duplicate-requirement") {
      expect(result.error.requirement).toBe(1);
      expect(result.error.lines).toEqual([1, 4]);
    }
  });

  it("2.10 an empty title is an error naming the file and the line", () => {
    const result = parseRequirementTitles("# Doc\n### Requirement 7:   \n", FILE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("empty-title");
    expect(result.error.message).toContain(`${FILE}:2`);
    expect(result.error.message).toContain("7");
  });

  it("2.9 parseRequirements keeps its value on this spec's own requirements.md", () => {
    const text = readFileSync(
      new URL("../../../../.kiro/specs/mutant-engine/requirements.md", import.meta.url),
      "utf8",
    );
    const result = parseRequirements(text, FILE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Independent count: numbered items under each "#### Acceptance Criteria" heading.
    const expected: string[] = [];
    let requirement: number | undefined;
    let inCriteria = false;
    let fenced = false;
    for (const line of text.split(/\r?\n/)) {
      if (/^ {0,3}(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) continue;
      const heading = /^### Requirement (\d+):/.exec(line);
      if (heading) {
        requirement = Number(heading[1]);
        inCriteria = false;
      } else if (/^#{1,6}\s/.test(line)) {
        inCriteria = /^#### Acceptance Criteria\s*$/.test(line);
      } else if (inCriteria) {
        const item = /^(\d+)\.\s+\S/.exec(line);
        if (item) expected.push(`${requirement}.${item[1]}`);
      }
    }
    expect(result.value.map((c) => c.id)).toEqual(expected);
    expect(result.value.length).toBeGreaterThan(0);
    expect(parseRequirementTitles(text, FILE).ok).toBe(true);
  });
});
