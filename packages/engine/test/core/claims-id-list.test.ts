import { describe, expect, it } from "vitest";
import { parseClaimComments } from "../../src/core/claims.js";

const c = (id: string) => ({ kind: "criterion", id }) as const;
const r = (number: number) => ({ kind: "requirement", number }) as const;
const parse = (line: string) => parseClaimComments([line], "cart-pricing");

describe("claim id list end", () => {
  it("11.3 a sentence mark after the last id keeps that id", () => {
    expect(parse("// Validates: Requirements 7.3, 7.4.")).toEqual([c("7.3"), c("7.4")]);
  });

  it("11.3 a closing parenthesis after the last id keeps that id", () => {
    expect(parse("Validates: Requirements 5.1, 5.2)")).toEqual([c("5.1"), c("5.2")]);
  });

  it("11.3 a semicolon after an id counts and ends the list", () => {
    expect(parse("Validates: Requirements 1.1; 5.1")).toEqual([c("1.1")]);
  });

  it("11.3 a colon after an id counts and ends the list", () => {
    expect(parse("Validates: Requirements 1.1: 5.1")).toEqual([c("1.1")]);
  });

  it("11.3 a closing bracket after an id counts and ends the list", () => {
    expect(parse("Validates: Requirements 1.1] 5.1")).toEqual([c("1.1")]);
  });

  it("11.3 an id followed by several marks counts: dot and parenthesis", () => {
    expect(parse("Validates: Requirements 5.1, 7.4.) 5.2")).toEqual([c("5.1"), c("7.4")]);
  });

  it("11.3 an id followed by several marks counts: dot and semicolon", () => {
    expect(parse("Validates: Requirements 5.1, 7.4.; 5.2")).toEqual([c("5.1"), c("7.4")]);
  });

  it("11.3 a token with three parts is not an id and ends the list", () => {
    expect(parse("Validates: Requirements 5.1, 7.4.1, 5.2")).toEqual([c("5.1")]);
  });

  it("11.3 a token with a letter suffix is not an id and ends the list", () => {
    expect(parse("Validates: Requirements 5.1, 7.4x, 5.2")).toEqual([c("5.1")]);
  });

  it("11.3 a whole requirement followed by a mark is not an id and ends the list", () => {
    expect(parse("Validates: Requirements 2.1, 5.")).toEqual([c("2.1")]);
  });

  it("11.3 a whole requirement without a mark is still an id", () => {
    expect(parse("Validates: Requirements 2.1, 5")).toEqual([c("2.1"), r(5)]);
  });

  it("11.3 a mark with no id gives no claims", () => {
    expect(parse("Validates: Requirements .")).toEqual([]);
  });
});
