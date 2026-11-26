import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreatureLink } from "../../src/bestiary/CreatureLink.js";
import type { CreatureState } from "../../src/bestiary/state.js";

const mutant = {
  file: "src/cart.ts",
  location: { start: { line: 12 } },
  original: ">=",
  replacement: ">",
};

function renderLink(state: CreatureState = "survivor", id = "oath-4.3-x") {
  return render(
    <CreatureLink
      mutantId={id}
      species="Borderling"
      state={state}
      mutant={mutant}
      place="sealCreature"
    />,
  );
}

describe("CreatureLink", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  afterEach(cleanup);

  it("6.13 a click opens the mutant route", async () => {
    renderLink();
    await userEvent.click(screen.getByRole("link"));
    expect(window.location.hash).toBe("#/mutant/oath-4.3-x");
  });

  it("6.13 Enter opens the mutant route", async () => {
    renderLink();
    screen.getByRole("link").focus();
    await userEvent.keyboard("{Enter}");
    expect(window.location.hash).toBe("#/mutant/oath-4.3-x");
  });

  it("6.13 Space opens the mutant route", async () => {
    renderLink();
    screen.getByRole("link").focus();
    await userEvent.keyboard(" ");
    expect(window.location.hash).toBe("#/mutant/oath-4.3-x");
  });

  it("6.13 the id is encoded in the route", async () => {
    renderLink("survivor", "a b/c");
    await userEvent.click(screen.getByRole("link"));
    expect(window.location.hash).toBe("#/mutant/a%20b%2Fc");
  });

  it.each([
    ["survivor", "survived"],
    ["killed", "killed"],
    ["in-the-dark", "no test runs this code"],
    ["ghost", "ghost, not counted"],
  ] as const)("10.5 state %s shows the visible label %s", (state, label) => {
    const { container } = renderLink(state);
    expect(screen.getByText(label)).toBeTruthy();
    expect(container.querySelector(`[data-state-shape="${state}"]`)).not.toBeNull();
  });

  it("10.5 each state has a different shape", () => {
    const shapes = (["survivor", "killed", "in-the-dark", "ghost"] as const).map((state) => {
      const { container, unmount } = renderLink(state);
      const shape = container.querySelector("[data-state-shape]")?.innerHTML ?? "";
      unmount();
      return shape;
    });
    expect(new Set(shapes).size).toBe(4);
  });

  it("10.6 Tab reaches the creature", async () => {
    renderLink();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("link"));
  });

  it("10.6 Tab visits creatures in DOM order", async () => {
    render(
      <>
        <CreatureLink
          mutantId="first"
          species="Hollow"
          state="killed"
          mutant={mutant}
          place="sealCreature"
        />
        <CreatureLink
          mutantId="second"
          species="Hollow"
          state="ghost"
          mutant={mutant}
          place="sealCreature"
        />
      </>,
    );
    const links = screen.getAllByRole("link");
    await userEvent.tab();
    expect(document.activeElement).toBe(links[0]);
    await userEvent.tab();
    expect(document.activeElement).toBe(links[1]);
  });
});
