import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RunProvider, useRun } from "../../src/app/run-context.js";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import { buildRunModel } from "../../src/loader/run-model.js";
import type { ParsedFile } from "../../src/loader/types.js";
import { Specimen } from "../../src/screens/Specimen.js";
import { readFixture } from "../fixtures/load.js";

const parsed = (kind: "mutation-report" | "verdict", text: string, name: string): ParsedFile => {
  const result = parseFile(kind, text, name);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

type VerdictJson = {
  coverage: { criterion: string; text?: string }[];
  witnesses: Record<string, unknown>;
};

type Variant = { witness?: boolean; criterionText?: boolean };

/** The fixture verdict, with the text of criterion 2.1 and a witness for m6 added on request. */
const verdictText = ({ witness = true, criterionText = true }: Variant): string => {
  const verdict = JSON.parse(readFixture("verdict.json")) as VerdictJson;
  const criterion = verdict.coverage.find((c) => c.criterion === "2.1");
  if (criterion !== undefined && criterionText) criterion.text = "WHEN n is 11, THE cart SHALL ok.";
  if (witness) {
    verdict.witnesses.m6 = {
      from: "src/price.ts",
      export: "big",
      args: [11],
      expected: true,
      mutatedOutcome: { kind: "value", value: false },
    };
  }
  return JSON.stringify(verdict);
};

function Loader({ variant }: { variant: Variant }) {
  const { applyLoad } = useRun();
  useEffect(() => {
    const files = [
      parsed("mutation-report", readFixture("report.json"), "report.json"),
      parsed("verdict", verdictText(variant), "verdict.json"),
    ];
    const joined = joinRun(files);
    if (!joined.ok) throw new Error(joined.error.message);
    applyLoad({ ok: true, value: buildRunModel(joined.value) });
  }, [applyLoad, variant]);
  return null;
}

const open = (id: string, variant: Variant = {}) =>
  render(
    <RunProvider>
      <Loader variant={variant} />
      <Specimen mutantId={id} />
    </RunProvider>,
  );

afterEach(cleanup);

describe("Specimen design", () => {
  it("13.15 the breadcrumb of a Spec_Mutant has the requirement part", () => {
    const { container } = open("m6");
    const crumbs = [...container.querySelectorAll(".specimen__breadcrumb li")];
    expect(crumbs.map((c) => c.textContent)).toEqual(["Verdict", "requirement 2.1", "m6"]);
    expect(crumbs[0]?.querySelector("a")?.getAttribute("href")).toBe("#/verdict");
  });

  it("13.15 the breadcrumb of a mechanical mutant has no requirement part", () => {
    const { container } = open("m1");
    const crumbs = [...container.querySelectorAll(".specimen__breadcrumb li")];
    expect(crumbs.map((c) => c.textContent)).toEqual(["Verdict", "m1"]);
  });

  it("13.15 the plate holds the creature and a caption with the Species and the state", () => {
    const { container } = open("m6");
    const plate = container.querySelector(".specimen__plate");
    expect(plate?.querySelector("svg")).not.toBeNull();
    expect(plate?.querySelector("figcaption")?.textContent).toContain("Oathbreaker");
    expect(plate?.querySelector("figcaption")?.textContent).toContain("survived");
  });

  it("13.15 the promise is a blockquote with the Criterion text", () => {
    const { container } = open("m6");
    const promise = container.querySelector(".specimen__promise");
    expect(promise?.tagName).toBe("BLOCKQUOTE");
    expect(promise?.textContent).toBe("WHEN n is 11, THE cart SHALL ok.");
  });

  it("13.15 the change is one block with a - line and a + line", () => {
    const { container } = open("m6");
    const change = container.querySelector(".specimen__change");
    const marks = [...(change?.querySelectorAll(".specimen__mark") ?? [])];
    expect(marks.map((m) => m.textContent)).toEqual(["-", "+"]);
    expect(change?.querySelector('pre[data-line="original"]')?.textContent).toBe(
      "export const big = (n: number): boolean => n >= 10;",
    );
    // The fixture's columns do not line up with its source text, so only the replacement is checked.
    expect(change?.querySelector('pre[data-line="mutated"]')?.textContent).toContain("n > 11");
  });

  it("13.15 the witness is three cards: input, the spec demands, the mutant gives", () => {
    const { container } = open("m6");
    const cards = [...container.querySelectorAll(".specimen__witness .specimen__card")];
    expect(cards).toHaveLength(3);
    expect(cards[0]?.textContent).toContain("big(11)");
    expect(cards[1]?.textContent).toContain("The spec demands");
    expect(cards[1]?.textContent).toContain("true");
    expect(cards[2]?.textContent).toContain("The mutant gives");
    expect(cards[2]?.textContent).toContain("value: false");
  });

  it("13.15 a missing witness omits only the witness section", () => {
    const { container } = open("m6", { witness: false });
    expect(container.querySelector(".specimen__witness")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Witness" })).toBeNull();
    expect(container.querySelector(".specimen__promise")).not.toBeNull();
    expect(container.querySelector(".specimen__change")).not.toBeNull();
  });

  it("13.15 a missing Criterion text omits only the promise section", () => {
    const { container } = open("m6", { criterionText: false });
    expect(container.querySelector(".specimen__promise")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Criterion" })).toBeNull();
    expect(container.querySelector(".specimen__witness")).not.toBeNull();
    expect(container.querySelector(".specimen__change")).not.toBeNull();
  });

  it("13.6 the h1 is 'The Oathbreaker' for the Spec_Mutant fixture", () => {
    open("m6");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("The Oathbreaker");
  });

  it("13.6 the h1 is 'Specimen not found' for an unknown id", () => {
    const { container } = open("nope");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Specimen not found");
    expect(container.querySelector(".specimen__breadcrumb")).toBeNull();
    expect(container.querySelector(".specimen__plate")).toBeNull();
  });

  it("13.18 the creature is drawn at the plate size", () => {
    const { container } = open("m6");
    const svg = container.querySelector(".specimen__plate svg");
    expect(svg?.getAttribute("width")).toBe("320");
    expect(svg?.getAttribute("height")).toBe("320");
  });
});
