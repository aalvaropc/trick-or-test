import { describe, expect, it } from "vitest";
import { parseHashRoute } from "../../src/router/routes.js";

describe("parseHashRoute", () => {
  it("11.3 routes by the URL hash: #/hunt gives the hunt route", () => {
    expect(parseHashRoute("#/hunt")).toEqual({ kind: "hunt" });
  });

  it("11.3 routes by the URL hash: #/plain gives the plain route", () => {
    expect(parseHashRoute("#/plain")).toEqual({ kind: "plain" });
  });

  it("11.3 routes by the URL hash: #/verdict gives the verdict route", () => {
    expect(parseHashRoute("#/verdict")).toEqual({ kind: "verdict" });
  });

  it("11.3 a path without a hash is not a route", () => {
    expect(parseHashRoute("/hunt")).toEqual({ kind: "landing" });
  });

  it("2.7 #/demo/before is a known demo route", () => {
    expect(parseHashRoute("#/demo/before")).toEqual({ kind: "demo", which: "before" });
  });

  it("2.7 #/demo/after is a known demo route", () => {
    expect(parseHashRoute("#/demo/after")).toEqual({ kind: "demo", which: "after" });
  });

  it("11.7 an empty hash gives landing", () => {
    expect(parseHashRoute("")).toEqual({ kind: "landing" });
  });

  it("11.7 #/ gives landing", () => {
    expect(parseHashRoute("#/")).toEqual({ kind: "landing" });
  });

  it("11.7 an unknown route gives landing", () => {
    expect(parseHashRoute("#/nowhere")).toEqual({ kind: "landing" });
  });

  it("11.7 an unknown demo name gives landing", () => {
    expect(parseHashRoute("#/demo/during")).toEqual({ kind: "landing" });
  });

  it("11.4 a plain mutant id gives a specimen route", () => {
    expect(parseHashRoute("#/mutant/oath-4.3-threshold-before-coupon")).toEqual({
      kind: "specimen",
      mutantId: "oath-4.3-threshold-before-coupon",
    });
  });

  it("11.4 a percent-encoded mutant id is decoded", () => {
    expect(parseHashRoute("#/mutant/a%2Fb%20c%23d")).toEqual({
      kind: "specimen",
      mutantId: "a/b c#d",
    });
  });

  it("11.4 a malformed percent-encoding falls back to the raw id without throwing", () => {
    expect(parseHashRoute("#/mutant/100%")).toEqual({ kind: "specimen", mutantId: "100%" });
  });

  it("11.7 a mutant route without an id gives landing", () => {
    expect(parseHashRoute("#/mutant/")).toEqual({ kind: "landing" });
  });
});
