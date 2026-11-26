import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Mutant, RunModel } from "../../../src/loader/run-model.js";
import { WhoKilledPanel } from "../../../src/screens/verdict/WhoKilledPanel.js";

const killed = (id: string, killClass: string): Mutant =>
  ({
    id,
    state: "killed",
    species: "Oathbreaker",
    file: "src/a.ts",
    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
    verdictEntry: { id, killClass },
  }) as unknown as Mutant;

const run = (mutants: Mutant[]): RunModel =>
  ({ report: {}, history: [], ignoredVerdictEntryCount: 0, mutants }) as unknown as RunModel;

const fillWidth = (killClass: string): string | undefined =>
  (
    screen
      .getByTestId(`kill-group-${killClass}`)
      .querySelector(".who-killed__fill") as HTMLElement | null
  )?.style.width;

afterEach(cleanup);

describe("WhoKilledPanel design", () => {
  it("13.13 the bar width of each group equals its share of the killed mutants", () => {
    render(
      <WhoKilledPanel
        model={run([
          killed("a", "examples-only"),
          killed("b", "examples-only"),
          killed("c", "examples-only"),
          killed("d", "properties-only"),
        ])}
      />,
    );
    expect(fillWidth("examples-only")).toBe("75%");
    expect(fillWidth("properties-only")).toBe("25%");
    expect(fillWidth("both")).toBe("0%");
    expect(fillWidth("unattributed")).toBe("0%");
  });

  it("13.13 with no killed mutants every bar is 0% wide", () => {
    render(<WhoKilledPanel model={run([])} />);
    for (const c of ["examples-only", "properties-only", "both", "unattributed"]) {
      expect(fillWidth(c)).toBe("0%");
    }
  });

  it("13.13 a single group holding every kill is 100% wide", () => {
    render(<WhoKilledPanel model={run([killed("a", "both")])} />);
    expect(fillWidth("both")).toBe("100%");
  });

  it("13.13 the label and the count share one summary line with the bar under it", () => {
    render(<WhoKilledPanel model={run([killed("a", "both")])} />);
    const summary = screen.getByTestId("kill-group-both").querySelector("summary");
    expect(summary?.querySelector(".who-killed__line")?.textContent).toContain("both");
    expect(summary?.querySelector(".who-killed__bar")).not.toBeNull();
  });
});
