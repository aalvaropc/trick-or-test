import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Creature } from "../../src/bestiary/Creature.js";

const mutant = {
  file: "src/cart.ts",
  location: { start: { line: 12 } },
  original: ">=",
  replacement: ">",
};

describe("Creature component", () => {
  it("12.9 renders an svg with role img and the title", () => {
    const { container } = render(
      <Creature
        species="Borderling"
        seed="m1"
        state="survivor"
        mutant={mutant}
        place="sealCreature"
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.querySelector("title")?.textContent).toBe("Borderling, survivor: src/cart.ts:12");
  });

  it('12.9 a hostile file path such as "><script> renders no script element', () => {
    const hostile = { ...mutant, file: '"><script>alert(1)</script>' };
    const { container } = render(
      <Creature species="Hollow" seed="m2" state="killed" mutant={hostile} place="sealCreature" />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("svg title")?.textContent).toContain("<script>");
  });

  it("12.9 the same props give the same markup", () => {
    const first = render(
      <Creature species="Two-Face" seed="m3" state="ghost" mutant={mutant} place="sealCreature" />,
    ).container.innerHTML;
    const second = render(
      <Creature species="Two-Face" seed="m3" state="ghost" mutant={mutant} place="sealCreature" />,
    ).container.innerHTML;
    expect(second).toBe(first);
    expect(first).toContain("<svg");
  });
});
