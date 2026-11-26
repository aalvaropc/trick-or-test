import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Mutant, RunModel } from "../../../src/loader/run-model.js";
import { SpeciesLegend } from "../../../src/screens/verdict/SpeciesLegend.js";

const mutant = (id: string, species: string, state = "survivor"): Mutant =>
  ({
    id,
    species,
    state,
    file: "src/a.ts",
    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 3 } },
  }) as unknown as Mutant;

const run = (mutants: Mutant[]): RunModel =>
  ({ report: {}, history: [], ignoredVerdictEntryCount: 0, mutants }) as unknown as RunModel;

const fixture = run([
  mutant("b1", "Borderling"),
  mutant("b2", "Borderling", "killed"),
  mutant("b3", "Borderling", "in-the-dark"),
  mutant("o1", "Oathbreaker"),
  mutant("o2", "Oathbreaker", "killed"),
  mutant("h1", "Hollow", "killed"),
  mutant("g1", "Impostor", "not-counted"),
]);

afterEach(cleanup);

describe("SpeciesLegend", () => {
  it("6.12 lists only the Species present in the Run", () => {
    render(<SpeciesLegend model={fixture} />);
    const names = screen.getAllByRole("listitem").map((li) => li.querySelector("h3")?.textContent);
    expect(names).toEqual(["Borderling", "Hollow", "Oathbreaker"]);
    expect(screen.queryByText("Miscount")).toBeNull();
    expect(screen.queryByText("Two-Face")).toBeNull();
    expect(screen.queryByText("Unclassified")).toBeNull();
  });

  it("6.12 omits a Species whose only Mutants are not counted", () => {
    render(<SpeciesLegend model={fixture} />);
    expect(screen.queryByText("Impostor")).toBeNull();
  });

  it("6.12 shows the Mutant count of each Species", () => {
    render(<SpeciesLegend model={fixture} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0] as HTMLElement).getByText("3 mutants")).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText("1 mutant")).toBeTruthy();
    expect(within(items[2] as HTMLElement).getByText("2 mutants")).toBeTruthy();
  });

  it("6.12 shows the body description and mutation type of each Species", () => {
    render(<SpeciesLegend model={run([mutant("o1", "Oathbreaker")])} />);
    expect(screen.getByText("Carries a torn scroll")).toBeTruthy();
    expect(screen.getByText("Change that breaks an acceptance criterion")).toBeTruthy();
  });

  it("6.12 shows a plain note when the Run has no Mutants", () => {
    render(<SpeciesLegend model={run([])} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("no species in this run")).toBeTruthy();
  });
});
