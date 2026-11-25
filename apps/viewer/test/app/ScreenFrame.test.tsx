import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RunProvider, useRun } from "../../src/app/run-context.js";
import { SCREEN_NAMES, ScreenFrame, type ScreenId } from "../../src/app/ScreenFrame.js";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import { buildRunModel } from "../../src/loader/run-model.js";
import { readFixture } from "../fixtures/load.js";

const SCREENS: [ScreenId, string][] = [
  ["landing", "Landing"],
  ["verdict", "Verdict"],
  ["specimen", "Specimen"],
  ["hunt", "Hunt"],
  ["plain", "Plain view"],
];

const OpenRun = () => {
  const { applyLoad } = useRun();
  const report = parseFile("mutation-report", readFixture("report.json"), "report.json");
  if (!report.ok) throw new Error("fixture");
  const raw = joinRun([report.value]);
  if (!raw.ok) throw new Error("fixture");
  return (
    <button type="button" onClick={() => applyLoad({ ok: true, value: buildRunModel(raw.value) })}>
      open run
    </button>
  );
};

afterEach(() => {
  cleanup();
  document.title = "";
});

describe("screen frame", () => {
  it.each(SCREENS)("10.11 %s has exactly one h1 named after the screen", (screenId, name) => {
    render(
      <RunProvider>
        <ScreenFrame screen={screenId}>
          <p>body</p>
        </ScreenFrame>
      </RunProvider>,
    );
    const headings = document.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(name);
  });

  it.each(SCREENS)("10.11 document title of %s contains the screen name", (screenId, name) => {
    render(
      <RunProvider>
        <ScreenFrame screen={screenId}>{null}</ScreenFrame>
      </RunProvider>,
    );
    expect(document.title).toContain(name);
  });

  it("10.11 the document title follows a route change", () => {
    const view = render(
      <RunProvider>
        <ScreenFrame screen="hunt">{null}</ScreenFrame>
      </RunProvider>,
    );
    expect(document.title).toContain("Hunt");
    view.rerender(
      <RunProvider>
        <ScreenFrame screen="verdict">{null}</ScreenFrame>
      </RunProvider>,
    );
    expect(document.title).toContain("Verdict");
    expect(document.title).not.toContain("Hunt");
  });

  it("10.11 names cover exactly the five screens", () => {
    expect(Object.values(SCREEN_NAMES).sort()).toEqual(
      ["Hunt", "Landing", "Plain view", "Specimen", "Verdict"].sort(),
    );
  });

  it.each(SCREENS)("9.1 %s shows a visible link to the Plain_View", (screenId) => {
    render(
      <RunProvider>
        <ScreenFrame screen={screenId}>{null}</ScreenFrame>
      </RunProvider>,
    );
    const link = screen.getByRole("link", { name: "Plain view" });
    expect(link.getAttribute("href")).toBe("#/plain");
  });

  it("9.1 the Plain_View links to the Verdict_Screen only when a Run is open", () => {
    render(
      <RunProvider>
        <OpenRun />
        <ScreenFrame screen="plain">{null}</ScreenFrame>
      </RunProvider>,
    );
    expect(screen.queryByRole("link", { name: "Verdict" })).toBeNull();
    act(() => screen.getByRole("button", { name: "open run" }).click());
    expect(screen.getByRole("link", { name: "Verdict" }).getAttribute("href")).toBe("#/verdict");
  });
});
