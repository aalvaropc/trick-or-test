import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Mutant, RunModel } from "../../../src/loader/run-model.js";
import { SpeciesLegend } from "../../../src/screens/verdict/SpeciesLegend.js";

const mutant = (id: string, species: string): Mutant =>
  ({
    id,
    species,
    state: "survivor",
    file: "src/a.ts",
    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 3 } },
  }) as unknown as Mutant;

const run = (mutants: Mutant[]): RunModel =>
  ({ report: {}, history: [], ignoredVerdictEntryCount: 0, mutants }) as unknown as RunModel;

afterEach(cleanup);

describe("SpeciesLegend design", () => {
  it("13.14 each card shows a creature at the legend size, the name, the description, the type and the count", () => {
    const { container } = render(
      <SpeciesLegend model={run([mutant("b1", "Borderling"), mutant("b2", "Borderling")])} />,
    );
    const cards = container.querySelectorAll(".species-legend__entry");
    expect(cards).toHaveLength(1);
    const card = cards[0] as HTMLElement;
    const svg = card.querySelector("svg[role='img']");
    expect(svg?.getAttribute("width")).toBe("96");
    expect(card.querySelector("h3")?.textContent).toBe("Borderling");
    expect(card.textContent).toContain("Equality operator changed");
    expect(card.querySelector(".species-legend__count")?.textContent).toBe("2 mutants");
  });
});
