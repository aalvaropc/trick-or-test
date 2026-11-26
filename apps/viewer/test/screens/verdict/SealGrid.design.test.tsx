import { cleanup, render, screen, within } from "@testing-library/react";
import type { Verdict } from "trick-or-test/report";
import { afterEach, describe, expect, it } from "vitest";
import type { Mutant, RunModel } from "../../../src/loader/run-model.js";
import { SealGrid } from "../../../src/screens/verdict/SealGrid.js";

const survivor = (id: string, requirement: string): Mutant =>
  ({
    id,
    requirement,
    state: "survivor",
    species: "Oathbreaker",
    file: "src/cart.ts",
    location: { start: { line: 12, column: 1 }, end: { line: 12, column: 5 } },
    original: ">=",
    replacement: requirement,
  }) as unknown as Mutant;

const run = (coverage: unknown[], mutants: Mutant[] = []): RunModel =>
  ({
    report: {},
    verdict: { coverage } as unknown as Verdict,
    history: [],
    ignoredVerdictEntryCount: 0,
    mutants,
  }) as unknown as RunModel;

afterEach(cleanup);

describe("SealGrid design", () => {
  it("13.12 an unguarded Seal row has the Criterion id, and the text, and no Open specimen button", () => {
    render(
      <SealGrid
        model={run(
          [{ criterion: "4.3", status: "unguarded", text: "Free shipping from 100.00" }],
          [survivor("oath-4.3-x", "4.3")],
        )}
      />,
    );
    const row = screen.getByTestId("seal-4.3");
    expect(within(row).getByRole("heading", { name: "4.3" })).toBeTruthy();
    expect(row.textContent).toContain("Free shipping from 100.00");
    expect(within(row).queryByRole("link", { name: "Open specimen" })).toBeNull();
    expect(row.querySelector(".button")).toBeNull();
    expect(
      within(row)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["#/mutant/oath-4.3-x"]);
  });

  it("13.12 a Seal without criterion text shows no text element", () => {
    const { container } = render(
      <SealGrid model={run([{ criterion: "1.1", status: "guarded" }])} />,
    );
    expect(container.querySelector(".seal__text")).toBeNull();
  });
});
