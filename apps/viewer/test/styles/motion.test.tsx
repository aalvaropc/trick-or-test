import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Creature } from "../../src/bestiary/Creature.js";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "..", "..", "src", "styles", "motion.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const mutant = {
  file: "src/cart.ts",
  location: { start: { line: 12 } },
  original: ">=",
  replacement: ">",
};

function stubMatchMedia(reduce: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  stubMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("motion styles", () => {
  it("10.8 the declared erase duration is at most 600ms", () => {
    const rule = /\.creature--erasing[^{]*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    const durations = [...(rule?.[1] ?? "").matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)].map((m) =>
      m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1]),
    );
    expect(durations.length).toBeGreaterThan(0);
    for (const ms of durations) expect(ms).toBeLessThanOrEqual(600);
  });

  it("10.7 a global prefers-reduced-motion rule sets animation and transition to none", () => {
    const match = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}/.exec(css);
    expect(match).not.toBeNull();
    expect(match?.[1]).toMatch(/animation\s*:\s*none/);
    expect(match?.[1]).toMatch(/transition\s*:\s*none/);
    expect(match?.[1]).toMatch(/\*/);
  });

  it("10.9 the motion css has no gradient, glow or drop shadow", () => {
    expect(css).not.toMatch(/gradient|box-shadow|text-shadow|drop-shadow/i);
  });
});

describe("killed animation", () => {
  it("10.8 a creature changing to killed gets the erasing class", () => {
    const { container, rerender } = render(
      <Creature species="Hollow" seed="a" state="survivor" mutant={mutant} />,
    );
    expect(container.querySelector(".creature--erasing")).toBeNull();
    rerender(<Creature species="Hollow" seed="a" state="killed" mutant={mutant} />);
    expect(container.querySelector(".creature--erasing")).not.toBeNull();
  });

  it("10.8 the erasing class is removed after 600ms", () => {
    const { container, rerender } = render(
      <Creature species="Hollow" seed="a" state="survivor" mutant={mutant} />,
    );
    rerender(<Creature species="Hollow" seed="a" state="killed" mutant={mutant} />);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(container.querySelector(".creature--erasing")).toBeNull();
  });

  it("10.8 a second killed change while one runs does not start a second animation", () => {
    const first = render(<Creature species="Hollow" seed="a" state="survivor" mutant={mutant} />);
    const second = render(<Creature species="Hollow" seed="b" state="survivor" mutant={mutant} />);
    first.rerender(<Creature species="Hollow" seed="a" state="killed" mutant={mutant} />);
    second.rerender(<Creature species="Hollow" seed="b" state="killed" mutant={mutant} />);
    expect(first.container.querySelectorAll(".creature--erasing")).toHaveLength(1);
    expect(second.container.querySelectorAll(".creature--erasing")).toHaveLength(0);
  });

  it("10.8 a new animation may start once the previous one has finished", () => {
    const first = render(<Creature species="Hollow" seed="a" state="survivor" mutant={mutant} />);
    first.rerender(<Creature species="Hollow" seed="a" state="killed" mutant={mutant} />);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    const second = render(<Creature species="Hollow" seed="b" state="survivor" mutant={mutant} />);
    second.rerender(<Creature species="Hollow" seed="b" state="killed" mutant={mutant} />);
    expect(second.container.querySelectorAll(".creature--erasing")).toHaveLength(1);
  });

  it("10.8 a creature first drawn as killed is not animated", () => {
    const { container } = render(
      <Creature species="Hollow" seed="a" state="killed" mutant={mutant} />,
    );
    expect(container.querySelector(".creature--erasing")).toBeNull();
  });

  it("10.7 reduced motion gives no animation class and the final state at once", () => {
    stubMatchMedia(true);
    const { container, rerender } = render(
      <Creature species="Hollow" seed="a" state="survivor" mutant={mutant} />,
    );
    rerender(<Creature species="Hollow" seed="a" state="killed" mutant={mutant} />);
    expect(container.querySelector(".creature--erasing")).toBeNull();
    expect(container.querySelector("svg title")?.textContent).toContain("killed");
  });
});
