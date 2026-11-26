import { cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunProvider, useRun } from "../../src/app/run-context.js";
import { CREATURE_SIZES, type CreaturePlace } from "../../src/bestiary/creature-sizes.js";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import { buildRunModel, type RunModel } from "../../src/loader/run-model.js";
import type { ParsedFile } from "../../src/loader/types.js";
import { Hunt } from "../../src/screens/Hunt.js";
import { Landing } from "../../src/screens/Landing.js";
import { PlainView } from "../../src/screens/PlainView.js";
import { Specimen } from "../../src/screens/Specimen.js";
import { Verdict } from "../../src/screens/Verdict.js";
import { readFixture } from "../fixtures/load.js";

type Kind = "mutation-report" | "verdict" | "history";

const parsed = (kind: Kind, name: string): ParsedFile => {
  const result = parseFile(kind, readFixture(name), name);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const model = (): RunModel => {
  const joined = joinRun([
    parsed("mutation-report", "report.json"),
    parsed("verdict", "verdict.json"),
    parsed("history", "history.jsonl"),
  ]);
  if (!joined.ok) throw new Error(joined.error.message);
  return buildRunModel(joined.value);
};

function Loader({ value }: { value: RunModel }) {
  const { applyLoad } = useRun();
  useEffect(() => {
    applyLoad({ ok: true, value });
  }, [applyLoad, value]);
  return null;
}

const renderScreen = (screen: React.ReactNode) =>
  render(
    <RunProvider>
      <Loader value={model()} />
      {screen}
    </RunProvider>,
  );

/** The class of the container that decides the creature size of a place (design, "Static and DOM checks"). */
const PLACE_CONTAINERS: [string, CreaturePlace][] = [
  [".seal__survivors", "sealCreature"],
  [".who-killed__list", "panelList"],
  [".strays-strip", "straysStrip"],
  [".species-legend", "speciesLegend"],
  [".hunt__entry", "huntEntry"],
  [".specimen__plate", "specimenPlate"],
];

function expectedSize(svg: Element): number | undefined {
  if (svg.classList.contains("seal__drawing")) return CREATURE_SIZES.sealDrawing;
  for (const [selector, place] of PLACE_CONTAINERS) {
    if (svg.closest(selector) !== null) return CREATURE_SIZES[place];
  }
  return undefined;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const screens: [string, () => React.ReactNode, boolean][] = [
  ["verdict", () => <Verdict />, true],
  ["hunt", () => <Hunt />, true],
  ["specimen", () => <Specimen mutantId="m6" />, true],
  ["plain view", () => <PlainView />, false],
  ["landing", () => <Landing />, false],
];

describe("creature sizes", () => {
  for (const [name, make, draws] of screens) {
    it(`13.23 every svg of the ${name} screen has width and height equal to its place`, () => {
      const { container } = renderScreen(make());
      // The 14 px state mark next to each state label (10.5) is a shape icon, not a creature.
      for (const mark of container.querySelectorAll("svg.creature-link__shape")) {
        expect(mark.getAttribute("aria-hidden")).toBe("true");
        expect(mark.getAttribute("width")).toBe("14");
      }
      const svgs = [...container.querySelectorAll("svg:not(.creature-link__shape)")];
      if (draws) expect(svgs.length).toBeGreaterThan(0);
      else expect(svgs).toHaveLength(0);
      for (const svg of svgs) {
        const size = expectedSize(svg);
        expect(size, `no place for an svg in ${svg.parentElement?.className}`).toBeDefined();
        expect(svg.getAttribute("width")).toBe(String(size));
        expect(svg.getAttribute("height")).toBe(String(size));
        expect(Number(svg.getAttribute("width"))).toBeLessThanOrEqual(320);
      }
    });
  }

  it("13.23 the verdict screen draws a creature in every one of its places", () => {
    const { container } = renderScreen(<Verdict />);
    const sizes = new Set(
      [...container.querySelectorAll("svg:not(.creature-link__shape)")].map(expectedSize),
    );
    expect(sizes.has(CREATURE_SIZES.sealDrawing)).toBe(true);
    expect(sizes.has(CREATURE_SIZES.sealCreature)).toBe(true);
    expect(sizes.has(CREATURE_SIZES.speciesLegend)).toBe(true);
  });

  it("13.18 the sizes table matches the requirement", () => {
    expect(CREATURE_SIZES).toEqual({
      sealDrawing: 64,
      sealCreature: 56,
      panelList: 48,
      straysStrip: 56,
      speciesLegend: 96,
      huntEntry: 48,
      specimenPlate: 320,
    });
  });
});
