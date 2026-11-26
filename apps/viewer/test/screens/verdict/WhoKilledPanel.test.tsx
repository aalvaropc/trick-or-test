import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Mutant, RunModel } from "../../../src/loader/run-model.js";
import { WhoKilledPanel } from "../../../src/screens/verdict/WhoKilledPanel.js";

const mutant = (id: string, state: string, killClass?: string): Mutant =>
  ({
    id,
    state,
    species: "Borderling",
    file: "src/cart.ts",
    location: { start: { line: 12, column: 1 }, end: { line: 12, column: 3 } },
    original: ">=",
    replacement: ">",
    verdictEntry: killClass === undefined ? undefined : { killClass },
  }) as unknown as Mutant;

const run = (mutants: Mutant[]): RunModel =>
  ({
    report: {},
    verdict: undefined,
    history: [],
    ignoredVerdictEntryCount: 0,
    mutants,
  }) as unknown as RunModel;

const group = (name: string): HTMLElement => screen.getByTestId(`kill-group-${name}`);

const fixture = (): RunModel =>
  run([
    mutant("a", "killed", "examples-only"),
    mutant("b", "killed", "examples-only"),
    mutant("c", "killed", "both"),
    mutant("d", "killed", "unattributed"),
    mutant("e", "killed"),
    mutant("f", "survivor", "properties-only"),
    mutant("g", "not-counted", "both"),
  ]);

afterEach(cleanup);

describe("WhoKilledPanel", () => {
  it("6.8 shows four groups, each with its count and zero included", () => {
    render(<WhoKilledPanel model={fixture()} />);
    expect(screen.getAllByTestId(/^kill-group-/)).toHaveLength(4);
    expect(within(group("examples-only")).getByTestId("kill-count").textContent).toBe("2");
    expect(within(group("properties-only")).getByTestId("kill-count").textContent).toBe("0");
    expect(within(group("both")).getByTestId("kill-count").textContent).toBe("1");
    expect(within(group("unattributed")).getByTestId("kill-count").textContent).toBe("1");
    expect(within(group("examples-only")).getByText("examples only")).toBeTruthy();
    expect(within(group("properties-only")).getByText("properties only")).toBeTruthy();
    expect(within(group("both")).getByText("both")).toBeTruthy();
    expect(within(group("unattributed")).getByText("unattributed")).toBeTruthy();
  });

  it("6.9 an open group lists every Mutant of the group", () => {
    render(<WhoKilledPanel model={fixture()} />);
    const links = within(group("examples-only")).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["#/mutant/a", "#/mutant/b"]);
    expect(group("examples-only").querySelector("summary")).not.toBeNull();
  });

  it("6.9 an empty group says no mutants in this group", () => {
    render(<WhoKilledPanel model={fixture()} />);
    const el = group("properties-only");
    expect(within(el).getByText("no mutants in this group")).toBeTruthy();
    expect(within(el).queryAllByRole("link")).toHaveLength(0);
  });

  it("6.15 the sum of the counts equals the killed Mutants that have a class", () => {
    render(<WhoKilledPanel model={fixture()} />);
    const total = screen
      .getAllByTestId("kill-count")
      .reduce((sum, el) => sum + Number(el.textContent), 0);
    expect(total).toBe(4);
  });
});
