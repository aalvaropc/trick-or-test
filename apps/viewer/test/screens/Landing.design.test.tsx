import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunProvider } from "../../src/app/run-context.js";
import { Landing } from "../../src/screens/Landing.js";

const setup = () =>
  render(
    <RunProvider>
      <Landing />
    </RunProvider>,
  );

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

describe("Landing design", () => {
  it("13.6 the h1 reads the Landing title and not the screen name", () => {
    setup();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("A Bestiary of Bugs Your Tests Never Noticed");
    expect(headings[0]?.textContent).not.toBe("Landing");
  });

  it("13.7 the two demo links are separate .button elements inside .landing__demos", () => {
    const { container } = setup();
    const demos = container.querySelector(".landing__demos");
    expect(demos).not.toBeNull();
    const links = [...(demos?.querySelectorAll("a") ?? [])];
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["before the hunt", "#/demo/before"],
      ["after the hunt", "#/demo/after"],
    ]);
    for (const link of links) expect(link.classList.contains("button")).toBe(true);
    expect(links[0]?.contains(links[1] ?? null)).toBe(false);
  });

  it("13.7 the intro paragraph in the header states the three meanings", () => {
    const { container } = setup();
    const intro = container.querySelector(".page__header .landing__intro");
    expect(intro?.tagName).toBe("P");
    const text = intro?.textContent ?? "";
    expect(text).toMatch(/species is the kind of change/i);
    expect(text).toMatch(/eyes are the test outcome/i);
    expect(text).toMatch(/seal is a requirement's status/i);
  });

  it("13.7 the privacy statement, the drop zone and the licences come after the demo links", () => {
    const { container } = setup();
    const order = [
      ".landing__intro",
      '[data-testid="pitch"]',
      ".landing__demos",
      ".landing__privacy",
      ".drop-zone",
      "details",
    ].map((selector) => container.querySelector(selector));
    for (const element of order) expect(element).not.toBeNull();
    for (let i = 1; i < order.length; i++) {
      const before = order[i - 1] as Element;
      const after = order[i] as Element;
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("13.8 the visible picker is a label.button tied to a visually hidden native input", () => {
    const { container } = setup();
    const zone = container.querySelector(".drop-zone");
    const label = zone?.querySelector("label.button");
    const input = zone?.querySelector<HTMLInputElement>('input[type="file"]');
    expect(label?.textContent).toBe("Choose files");
    expect(input).not.toBeNull();
    expect(input?.classList.contains("visually-hidden")).toBe(true);
    expect(label?.getAttribute("for")).toBe(input?.id);
    expect(input?.id).not.toBe("");
    expect(zone?.querySelector("button")).toBeNull();
  });

  it("3.5 the native input is reachable by keyboard", async () => {
    const user = userEvent.setup();
    const { container } = setup();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input?.hidden).toBe(false);
    expect(input?.tabIndex).toBe(0);
    // Tab stops before the input: the Plain view link and the two demo links.
    for (let stop = 0; stop < 4; stop++) await user.tab();
    expect(document.activeElement).toBe(input);
  });

  it("13.8 dragging a file over the drop zone sets data-dragging, leaving clears it", () => {
    setup();
    const zone = screen.getByRole("region", { name: "Load a run" });
    expect(zone.hasAttribute("data-dragging")).toBe(false);
    fireEvent.dragOver(zone);
    expect(zone.getAttribute("data-dragging")).toBe("true");
    fireEvent.dragLeave(zone);
    expect(zone.hasAttribute("data-dragging")).toBe(false);
  });
});
