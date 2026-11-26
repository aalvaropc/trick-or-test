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

const seal = (criterion: string): HTMLElement => screen.getByTestId(`seal-${criterion}`);

afterEach(cleanup);

describe("SealGrid", () => {
  it("6.2 labels each seal with its Criterion id", () => {
    render(
      <SealGrid
        model={run([
          { criterion: "1.1", status: "guarded" },
          { criterion: "1.2", status: "unattacked" },
        ])}
      />,
    );
    expect(within(seal("1.1")).getByText("1.1")).toBeTruthy();
    expect(within(seal("1.2")).getByText("1.2")).toBeTruthy();
  });

  it("6.3 draws a guarded Criterion as a closed seal labelled guarded", () => {
    render(<SealGrid model={run([{ criterion: "1.1", status: "guarded" }])} />);
    expect(seal("1.1").getAttribute("data-seal")).toBe("closed");
    expect(within(seal("1.1")).getByText("guarded")).toBeTruthy();
  });

  it("6.4 draws an unguarded Criterion as a cracked seal with each survivor as a link", () => {
    render(
      <SealGrid
        model={run(
          [{ criterion: "1.1", status: "unguarded" }],
          [survivor("a", "1.1"), survivor("b", "1.1"), survivor("c", "9.9")],
        )}
      />,
    );
    const el = seal("1.1");
    expect(el.getAttribute("data-seal")).toBe("cracked");
    expect(within(el).getByText("unguarded")).toBeTruthy();
    const links = within(el).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["#/mutant/a", "#/mutant/b"]);
  });

  it("6.5 draws an unattacked Criterion as an empty seal labelled no mutant bred", () => {
    render(<SealGrid model={run([{ criterion: "1.1", status: "unattacked" }])} />);
    expect(seal("1.1").getAttribute("data-seal")).toBe("empty");
    expect(within(seal("1.1")).getByText("no mutant bred")).toBeTruthy();
  });

  it("6.6 draws a skipped Criterion as a skipped mark with its reason", () => {
    render(
      <SealGrid model={run([{ criterion: "1.1", status: "skipped", reason: "no witness" }])} />,
    );
    expect(seal("1.1").getAttribute("data-seal")).toBe("skipped");
    expect(within(seal("1.1")).getByText("skipped")).toBeTruthy();
    expect(within(seal("1.1")).getByText("no witness")).toBeTruthy();
  });

  it("6.7 marks an unrecognised status and still draws the other seals", () => {
    render(
      <SealGrid
        model={run([
          { criterion: "1.1", status: "bogus" },
          { criterion: "1.2", status: "guarded" },
        ])}
      />,
    );
    expect(seal("1.1").getAttribute("data-seal")).toBe("unrecognised");
    expect(within(seal("1.1")).getByText("unrecognised status")).toBeTruthy();
    expect(seal("1.2").getAttribute("data-seal")).toBe("closed");
  });

  it("6.16 seal count equals coverage list length", () => {
    const coverage = [
      { criterion: "1.1", status: "guarded" },
      { criterion: "1.2", status: "unguarded" },
      { criterion: "1.3", status: "skipped", reason: "r" },
      { criterion: "1.4", status: "nope" },
      { criterion: "1.5", status: "unattacked" },
    ];
    render(<SealGrid model={run(coverage)} />);
    expect(screen.getAllByTestId(/^seal-/)).toHaveLength(coverage.length);
  });
});
