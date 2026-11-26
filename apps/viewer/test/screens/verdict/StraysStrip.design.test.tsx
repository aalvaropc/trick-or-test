import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Mutant, RunModel } from "../../../src/loader/run-model.js";
import { StraysStrip } from "../../../src/screens/verdict/StraysStrip.js";

const stray = (n: number): Mutant =>
  ({
    id: `s${String(n).padStart(3, "0")}`,
    requirement: undefined,
    state: "survivor",
    species: "Borderling",
    file: "src/a.ts",
    location: { start: { line: n + 1, column: 1 }, end: { line: n + 1, column: 3 } },
    original: ">=",
    replacement: ">",
  }) as unknown as Mutant;

const run = (count: number): RunModel =>
  ({
    report: {},
    history: [],
    ignoredVerdictEntryCount: 0,
    mutants: Array.from({ length: count }, (_, i) => stray(i)),
  }) as unknown as RunModel;

afterEach(cleanup);

describe("StraysStrip design", () => {
  it("13.14 the strip holds at most 60 creatures, each in the strays place", () => {
    const { container } = render(<StraysStrip model={run(75)} />);
    const svgs = container.querySelectorAll(".strays-strip__list svg[role='img']");
    expect(svgs).toHaveLength(60);
    for (const svg of svgs) {
      expect(svg.getAttribute("width")).toBe("56");
      expect(svg.getAttribute("height")).toBe("56");
    }
  });

  it("6.10 the strip is a list of creature links", () => {
    const { container } = render(<StraysStrip model={run(3)} />);
    expect(container.querySelectorAll(".strays-strip__list > li a.creature-link")).toHaveLength(3);
  });
});
