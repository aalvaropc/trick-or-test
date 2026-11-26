import { describe, expect, it } from "vitest";
import { parseClaimComments, resolveClaimRefs } from "../../src/core/claims.js";
import type { Criterion, CriterionId } from "../../src/core/types.js";

function criterion(requirement: number, index: number): Criterion {
  return {
    id: `${requirement}.${index}` as CriterionId,
    requirement,
    criterion: index,
    text: `text ${requirement}.${index}`,
    line: requirement * 10 + index,
  };
}

const criteria: Criterion[] = [
  criterion(1, 1),
  criterion(5, 1),
  criterion(5, 2),
  criterion(5, 3),
  criterion(7, 3),
];

const c = (id: string) => ({ kind: "criterion", id }) as const;
const r = (number: number) => ({ kind: "requirement", number }) as const;

describe("parseClaimComments", () => {
  it("11.2 a Feature line that names this spec gives the claims", () => {
    const lines = [
      "Feature: cart-pricing, Property 9: Breakdown",
      "**Validates: Requirements 5.5**",
    ];
    expect(parseClaimComments(lines, "cart-pricing")).toEqual([c("5.5")]);
  });

  it("11.2 a Feature line that names another spec gives no claims", () => {
    const lines = ["Feature: other-spec, Property 1: X", "Validates: Requirements 5.5"];
    expect(parseClaimComments(lines, "cart-pricing")).toEqual([]);
  });

  it("11.10 no Feature line gives the claims", () => {
    expect(parseClaimComments(["Validates: Requirements 2.1"], "cart-pricing")).toEqual([c("2.1")]);
  });

  it("11.3 Requirements 5.5, 7.3, 7.4 gives three refs", () => {
    expect(parseClaimComments(["Validates: Requirements 5.5, 7.3, 7.4"], "s")).toEqual([
      c("5.5"),
      c("7.3"),
      c("7.4"),
    ]);
  });

  it("11.3 Requirement 5 gives one whole-requirement ref", () => {
    expect(parseClaimComments(["Validates: Requirement 5"], "s")).toEqual([r(5)]);
  });

  it("11.3 ids separated by 'and' are read", () => {
    expect(parseClaimComments(["Validates: Requirements 5.1 and 5.2"], "s")).toEqual([
      c("5.1"),
      c("5.2"),
    ]);
  });

  it("11.3 ids separated by a comma are read", () => {
    expect(parseClaimComments(["Validates: Requirements 5.1, 5.2"], "s")).toEqual([
      c("5.1"),
      c("5.2"),
    ]);
  });

  it("11.3 the bold form with markers is read", () => {
    expect(parseClaimComments(["**Validates: Requirements 5.5**"], "s")).toEqual([c("5.5")]);
  });

  it("11.7 other comment lines around the annotation do not change the result", () => {
    const lines = [
      "Feature: cart-pricing, Property 9",
      "some prose about the test",
      "**Validates: Requirements 5.5**",
      "more prose",
    ];
    expect(parseClaimComments(lines, "cart-pricing")).toEqual([c("5.5")]);
  });

  it("11.3 a range token 5.1-5.3 ends the list and keeps the ids before it", () => {
    expect(parseClaimComments(["Validates: Requirements 2.1, 5.1-5.3, 7.3"], "s")).toEqual([
      c("2.1"),
    ]);
  });

  it("11.3 a token 5. ends the list and keeps the ids before it", () => {
    expect(parseClaimComments(["Validates: Requirements 2.1, 5., 7.3"], "s")).toEqual([c("2.1")]);
  });

  it("11.3 a word token x ends the list and keeps the ids before it", () => {
    expect(parseClaimComments(["Validates: Requirements 2.1 x 7.3"], "s")).toEqual([c("2.1")]);
  });

  it("11.3 Validates with no ids gives no claims", () => {
    expect(parseClaimComments(["Validates: Requirements"], "s")).toEqual([]);
    expect(parseClaimComments(["**Validates: Requirements **"], "s")).toEqual([]);
  });
});

describe("resolveClaimRefs", () => {
  it("11.4 a whole requirement expands to every criterion of it in document order", () => {
    expect(resolveClaimRefs([r(5)], criteria)).toEqual(["5.1", "5.2", "5.3"]);
  });

  it("11.5 an id the spec lacks stays as written", () => {
    expect(resolveClaimRefs([c("9.9")], criteria)).toEqual(["9.9"]);
  });

  it("11.5 a requirement number the spec lacks stays as written", () => {
    expect(resolveClaimRefs([r(99)], criteria)).toEqual(["99"]);
  });

  it("11.6 a repeated id collapses to one", () => {
    expect(resolveClaimRefs([c("7.3"), c("7.3")], criteria)).toEqual(["7.3"]);
  });

  it("11.6 a whole requirement that repeats a listed id collapses to one", () => {
    expect(resolveClaimRefs([c("5.2"), r(5)], criteria)).toEqual(["5.2", "5.1", "5.3"]);
  });
});
