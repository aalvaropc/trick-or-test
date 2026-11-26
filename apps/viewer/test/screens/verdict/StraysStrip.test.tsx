import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Mutant, RunModel } from "../../../src/loader/run-model.js";
import { StraysStrip } from "../../../src/screens/verdict/StraysStrip.js";

const stray = (
  id: string,
  state: string = "survivor",
  file = "src/a.ts",
  line = 1,
  requirement?: string,
): Mutant =>
  ({
    id,
    requirement,
    state,
    species: "Borderling",
    file,
    location: { start: { line, column: 1 }, end: { line, column: 3 } },
    original: ">=",
    replacement: ">",
  }) as unknown as Mutant;

const run = (mutants: Mutant[]): RunModel =>
  ({ report: {}, history: [], ignoredVerdictEntryCount: 0, mutants }) as unknown as RunModel;

const many = (n: number): Mutant[] =>
  Array.from({ length: n }, (_, i) =>
    stray(`m${String(i).padStart(3, "0")}`, "survivor", "src/a.ts", i + 1),
  );

const hrefs = (): (string | null)[] =>
  screen.queryAllByRole("link").map((l) => l.getAttribute("href"));

afterEach(cleanup);

describe("StraysStrip", () => {
  it("6.10 shows 60 creatures and no link when there are exactly 60 Strays", () => {
    render(<StraysStrip model={run(many(60))} />);
    expect(screen.getAllByRole("img")).toHaveLength(60);
    expect(screen.queryByRole("link", { name: /plain/i })).toBeNull();
    expect(screen.queryByText(/more/)).toBeNull();
  });

  it("6.11 shows 60 creatures, the remaining count and a plain view link for 61 Strays", () => {
    render(<StraysStrip model={run(many(61))} />);
    expect(screen.getAllByRole("img")).toHaveLength(60);
    expect(screen.getByText(/1 more/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /plain/i });
    expect(link.getAttribute("href")).toBe("#/plain");
  });

  it("6.11 draws Strays by status, then file, then line", () => {
    render(
      <StraysStrip
        model={run([
          stray("killed", "killed", "src/a.ts", 1),
          stray("b2", "survivor", "src/b.ts", 2),
          stray("a9", "survivor", "src/a.ts", 9),
          stray("a3", "survivor", "src/a.ts", 3),
          stray("dark", "in-the-dark", "src/a.ts", 1),
        ])}
      />,
    );
    expect(hrefs()).toEqual([
      "#/mutant/a3",
      "#/mutant/a9",
      "#/mutant/b2",
      "#/mutant/dark",
      "#/mutant/killed",
    ]);
  });

  it("6.10 leaves out Mutants tied to a Criterion", () => {
    render(
      <StraysStrip model={run([stray("s1"), stray("spec", "survivor", "src/a.ts", 2, "4.3")])} />,
    );
    expect(hrefs()).toEqual(["#/mutant/s1"]);
  });
});
