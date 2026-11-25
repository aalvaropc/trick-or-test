import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRequirements } from "../../src/core/requirements.js";

const FILE = "requirements.md";

const DOC = [
  "# Requirements Document",
  "",
  "### Requirement 1: First",
  "",
  "#### Acceptance Criteria",
  "",
  "1. THE X SHALL do a.",
  "2. THE X SHALL do b.",
  "",
  "### Requirement 2: Second",
  "",
  "#### Acceptance Criteria",
  "",
  "1. THE Y SHALL do c.",
].join("\n");

const ids = (text: string) => {
  const result = parseRequirements(text, FILE);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.map((c) => c.id);
};

describe("parseRequirements", () => {
  it("2.1 returns one criterion per numbered item under Acceptance Criteria", () => {
    const text = `${DOC}\n\n## Notes\n\n1. not a criterion`;
    expect(ids(text)).toEqual(["1.1", "1.2", "2.1"]);
  });

  it("2.2 builds the id from the requirement number and the item number", () => {
    const text = "### Requirement 12: Big\n\n#### Acceptance Criteria\n\n7. THE X SHALL z.";
    const result = parseRequirements(text, FILE);
    expect(result.ok && result.value[0]).toMatchObject({
      id: "12.7",
      requirement: 12,
      criterion: 7,
    });
  });

  it("2.3 records the item text and the 1-based line number", () => {
    const result = parseRequirements(DOC, FILE);
    expect(result.ok && result.value.map((c) => [c.text, c.line])).toEqual([
      ["THE X SHALL do a.", 7],
      ["THE X SHALL do b.", 8],
      ["THE Y SHALL do c.", 14],
    ]);
  });

  it("2.4 returns criteria in document order", () => {
    const text =
      "### Requirement 2: B\n#### Acceptance Criteria\n1. b\n### Requirement 1: A\n#### Acceptance Criteria\n1. a";
    expect(ids(text)).toEqual(["2.1", "1.1"]);
  });

  it("2.5 returns an error naming the file, the id and both lines for a duplicate id", () => {
    const text = `${DOC}\n### Requirement 1: Again\n#### Acceptance Criteria\n1. dup`;
    const result = parseRequirements(text, FILE);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "duplicate-id", filePath: FILE, id: "1.1", lines: [7, 17] },
    });
  });

  it("2.6 returns an error naming the file and line for an item outside any requirement", () => {
    const text = "# Doc\n\n#### Acceptance Criteria\n\n1. orphan";
    expect(parseRequirements(text, FILE)).toMatchObject({
      ok: false,
      error: { kind: "orphan-criterion", filePath: FILE, line: 5 },
    });
  });

  it("2.7 returns an error naming the file when there is no criterion", () => {
    const result = parseRequirements("# Doc\n\n### Requirement 1: Empty\n", FILE);
    expect(result).toMatchObject({ ok: false, error: { kind: "no-criteria", filePath: FILE } });
    expect(!result.ok && result.error.message).toContain(FILE);
  });

  it("2.1 parses the cart-pricing fixture: 8 requirements and 36 criteria", () => {
    const path = new URL("../../../../.kiro/specs/cart-pricing/requirements.md", import.meta.url);
    const result = parseRequirements(readFileSync(path, "utf8"), "cart-pricing/requirements.md");
    if (!result.ok) throw new Error(result.error.message);
    const perRequirement = [5, 3, 5, 4, 6, 4, 4, 5];
    const expected = perRequirement.flatMap((count, n) =>
      Array.from({ length: count }, (_, k) => `${n + 1}.${k + 1}`),
    );
    expect(result.value.map((c) => c.id)).toEqual(expected);
    expect(result.value).toHaveLength(36);
  });
});
