import { describe, expect, it } from "vitest";
import { applyMutation, revertMutation } from "../../src/core/mutation.js";
import type { CriterionId, MutantId, SpecMutant } from "../../src/core/types.js";

const mutant = (original: string, mutated: string): SpecMutant => ({
  id: "oath-5.2-x" as MutantId,
  requirement: "5.2" as CriterionId,
  file: "src/a.ts",
  original,
  mutated,
  why: "test",
  witness: { from: "src/a.ts", export: "f", args: [], expected: 1 },
});

describe("applyMutation / revertMutation", () => {
  it("5.2 replaces the single occurrence and reports the span", () => {
    const m = mutant("a > b", "a >= b");
    const r = applyMutation("if (a > b) go();", m);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mutated).toBe("if (a >= b) go();");
    expect(r.value.span).toEqual({ start: 4, end: 10 });
    expect(revertMutation(r.value.mutated, m, r.value.span)).toBe("if (a > b) go();");
  });

  it("5.2 returns NotApplicable when the original text does not occur", () => {
    const r = applyMutation("nothing here", mutant("a > b", "a >= b"));
    expect(r).toEqual({
      ok: false,
      error: { kind: "NotApplicable", mutant: "oath-5.2-x", occurrences: 0 },
    });
  });

  it("5.2 returns NotApplicable when the original text occurs twice", () => {
    const r = applyMutation("a > b; a > b;", mutant("a > b", "a >= b"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.occurrences).toBe(2);
  });

  it("5.2 counts overlapping occurrences as more than one", () => {
    const r = applyMutation("aaa", mutant("aa", "b"));
    expect(r.ok).toBe(false);
  });

  it("5.2 handles an occurrence at the start of the source", () => {
    const m = mutant("x + 1", "x - 1");
    const r = applyMutation("x + 1; rest", m);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mutated).toBe("x - 1; rest");
    expect(r.value.span).toEqual({ start: 0, end: 5 });
    expect(revertMutation(r.value.mutated, m, r.value.span)).toBe("x + 1; rest");
  });

  it("5.2 handles an occurrence at the end of the source", () => {
    const m = mutant("return 1", "return 2");
    const r = applyMutation("head; return 1", m);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mutated).toBe("head; return 2");
    expect(r.value.span).toEqual({ start: 6, end: 14 });
    expect(revertMutation(r.value.mutated, m, r.value.span)).toBe("head; return 1");
  });
});
