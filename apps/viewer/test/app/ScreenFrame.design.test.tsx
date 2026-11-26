import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RunProvider } from "../../src/app/run-context.js";
import { SCREEN_NAMES, ScreenFrame, type ScreenId } from "../../src/app/ScreenFrame.js";

const SCREENS: ScreenId[] = ["landing", "verdict", "specimen", "hunt", "plain"];
const INTERNAL_NAMES = ["Landing", "Verdict", "Specimen", "Hunt"];

const frame = (screenId: ScreenId, title = "A product title") =>
  render(
    <RunProvider>
      <ScreenFrame screen={screenId} title={title}>
        <p>body</p>
      </ScreenFrame>
    </RunProvider>,
  );

afterEach(() => {
  cleanup();
  document.title = "";
});

describe("screen frame design", () => {
  it.each(SCREENS)("13.6 the h1 of %s is the title prop, not an internal name", (screenId) => {
    frame(screenId, "The title in product words");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("The title in product words");
    expect(INTERNAL_NAMES).not.toContain(h1.textContent);
  });

  it.each(SCREENS)("13.6 the root of %s carries its id in data-screen", (screenId) => {
    const { container } = frame(screenId);
    const root = container.querySelector(".page");
    expect(root?.getAttribute("data-screen")).toBe(screenId);
    expect(Object.keys(SCREEN_NAMES)).toContain(root?.getAttribute("data-screen"));
  });

  it.each(SCREENS)("10.11 the document title of %s still contains the screen name", (screenId) => {
    frame(screenId, "Other words");
    expect(document.title).toContain(SCREEN_NAMES[screenId]);
    expect(document.title).not.toContain("Other words");
  });

  it.each(SCREENS)("10.11 %s has exactly one h1", (screenId) => {
    frame(screenId);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it("13.5 the header holds the product mark, the h1 and the nav, in that order", () => {
    const { container } = frame("hunt");
    const header = container.querySelector(".page__header");
    expect(header).not.toBeNull();
    const kids = [...(header?.children ?? [])];
    expect(kids.map((k) => k.className)).toEqual(["page__mark", "page__title", "page__nav"]);
    expect(kids[0]?.textContent).toBe("Trick or Test");
    expect(kids[1]?.tagName).toBe("H1");
    expect(kids[2]?.tagName).toBe("NAV");
    expect(container.querySelector(".page__main")?.textContent).toBe("body");
  });

  it("13.19 the nav links are separate elements", () => {
    const { container } = frame("plain");
    const links = container.querySelectorAll(".page__nav a");
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const link of links) {
      expect(link.parentElement?.className).toBe("page__nav");
    }
    expect(screen.getByRole("link", { name: "Plain view" }).getAttribute("href")).toBe("#/plain");
  });
});
