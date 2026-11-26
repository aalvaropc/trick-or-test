import { describe, expect, it } from "vitest";
import { buildVerdict, type VerdictInput } from "../../src/core/report.js";
import type { CriterionCoverage, CriterionId } from "../../src/core/types.js";

const cid = (s: string) => s as CriterionId;

const input = (coverage: CriterionCoverage[]): VerdictInput => ({
  coverage,
  mutants: [],
  witnesses: {},
  ignoreStaticRetried: false,
  projectRoot: "/proj",
  metadata: {
    gitCommit: "abc123",
    seed: 42,
    engineVersion: "0.1.0",
    nodeVersion: "22.0.0",
    strykerVersion: "9.0.0",
    vitestVersion: "3.0.0",
    typescriptVersion: "5.6.0",
    timestamp: "2025-01-01T00:00:00.000Z",
  },
});

const textOf = (c: CriterionCoverage): string | undefined => {
  const r = buildVerdict(input([c]));
  if (!r.ok) throw new Error(r.error);
  return r.value.coverage[0]?.text;
};

describe("buildVerdict, criterion text", () => {
  it("8.18 plain text is kept", () => {
    expect(textOf({ criterion: cid("4.1"), status: "guarded", text: "Shipping is free." })).toBe(
      "Shipping is free.",
    );
  });

  it("8.18 leading and trailing whitespace and newlines are trimmed", () => {
    expect(
      textOf({ criterion: cid("4.1"), status: "guarded", text: "\n  \tShipping is free.  \r\n\n" }),
    ).toBe("Shipping is free.");
  });

  it("8.18 inner whitespace is kept", () => {
    expect(textOf({ criterion: cid("4.1"), status: "guarded", text: " a  b\nc\td " })).toBe(
      "a  b\nc\td",
    );
  });

  it("8.17 an absolute path under the root becomes the relative path", () => {
    expect(
      textOf({
        criterion: cid("4.1"),
        status: "guarded",
        text: "See /proj/src/price.ts for the rule",
      }),
    ).toBe("See src/price.ts for the rule");
  });

  it("8.17 a path outside the root becomes <outside-project>/<basename>", () => {
    expect(
      textOf({ criterion: cid("4.1"), status: "guarded", text: "See /other/dir/notes.md now" }),
    ).toBe("See <outside-project>/notes.md now");
  });

  it("8.18 an entry without text has no text key", () => {
    const r = buildVerdict(input([{ criterion: cid("4.1"), status: "unattacked" }]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const entry = r.value.coverage[0] as CriterionCoverage;
    expect(Object.hasOwn(entry, "text")).toBe(false);
  });

  it("8.18 skipped entries keep reason and gain text", () => {
    const r = buildVerdict(
      input([
        {
          criterion: cid("4.2"),
          status: "skipped",
          reason: "not testable at /proj/src/a.ts",
          text: "  The cart rounds.  ",
        },
      ]),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.coverage[0]).toEqual({
      criterion: "4.2",
      status: "skipped",
      reason: "not testable at src/a.ts",
      text: "The cart rounds.",
    });
  });
});
