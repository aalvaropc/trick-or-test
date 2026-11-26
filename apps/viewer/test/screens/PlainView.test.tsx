import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RunProvider, useRun } from "../../src/app/run-context.js";
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

const parsed = (kind: "mutation-report" | "verdict", name: string): ParsedFile => {
  const result = parseFile(kind, readFixture(name), name);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const fixtureModel = (): RunModel => {
  const joined = joinRun([
    parsed("mutation-report", "report.json"),
    parsed("verdict", "verdict.json"),
  ]);
  if (!joined.ok) throw new Error(joined.error.message);
  return buildRunModel(joined.value);
};

function Loader({ model }: { model: RunModel }) {
  const { applyLoad } = useRun();
  useEffect(() => {
    applyLoad({ ok: true, value: model });
  }, [applyLoad, model]);
  return null;
}

const setup = (model: RunModel, screenNode = <PlainView />) =>
  render(
    <RunProvider>
      <Loader model={model} />
      {screenNode}
    </RunProvider>,
  );

const bodyRows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("tbody tr")) as HTMLElement[];

const firstColumn = (container: HTMLElement) =>
  bodyRows(container).map((r) => r.querySelector("td")?.textContent);

const header = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("PlainView", () => {
  it("9.2 shows one row per Mutant and seven columns", () => {
    const { container } = setup(fixtureModel());
    expect(bodyRows(container)).toHaveLength(7);
    expect(container.querySelectorAll("thead th")).toHaveLength(7);
    expect(container.querySelector(".table-scroll table")).not.toBeNull();
    const labels = Array.from(container.querySelectorAll("thead th")).map((th) =>
      th.textContent?.replace(/\s*(ascending|descending)$/, ""),
    );
    expect(labels).toEqual([
      "Mutant",
      "Species",
      "State",
      "Status",
      "Criterion",
      "File and line",
      "Kill class",
    ]);
  });

  it("9.3 a header click sorts ascending and shows the text", () => {
    const { container } = setup(fixtureModel());
    act(() => {
      fireEvent.click(header("Mutant"));
    });
    expect(firstColumn(container)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m7"]);
    expect(within(header("Mutant")).getByText("ascending")).toBeTruthy();
  });

  it("9.4 a second click on the same header sorts descending and shows the text", () => {
    const { container } = setup(fixtureModel());
    act(() => {
      fireEvent.click(header("Mutant"));
    });
    act(() => {
      fireEvent.click(header("Mutant"));
    });
    expect(firstColumn(container)).toEqual(["m7", "m6", "m5", "m4", "m3", "m2", "m1"]);
    expect(within(header("Mutant")).getByText("descending")).toBeTruthy();
    expect(screen.queryByText("ascending")).toBeNull();
  });

  it("9.10 sets aria-sort on the sorted header only", () => {
    const { container } = setup(fixtureModel());
    for (const th of Array.from(container.querySelectorAll("thead th"))) {
      expect(th.getAttribute("aria-sort") ?? "none").toBe("none");
    }
    act(() => {
      fireEvent.click(header("Species"));
    });
    expect(header("Species").closest("th")?.getAttribute("aria-sort")).toBe("ascending");
    expect(header("Mutant").closest("th")?.getAttribute("aria-sort") ?? "none").toBe("none");
    act(() => {
      fireEvent.click(header("Species"));
    });
    expect(header("Species").closest("th")?.getAttribute("aria-sort")).toBe("descending");
    act(() => {
      fireEvent.click(header("Status"));
    });
    expect(header("Species").closest("th")?.getAttribute("aria-sort") ?? "none").toBe("none");
    expect(header("Status").closest("th")?.getAttribute("aria-sort")).toBe("ascending");
  });

  it("9.9 headers are buttons that Enter and Space operate", () => {
    const { container } = setup(fixtureModel());
    const button = header("Mutant");
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.tabIndex).toBe(0);
    // A native button turns Enter and Space into a click; jsdom does not, so check the type
    // above and dispatch the click that the browser would produce.
    act(() => {
      button.focus();
      fireEvent.keyDown(button, { key: "Enter" });
      fireEvent.click(button);
    });
    expect(within(header("Mutant")).getByText("ascending")).toBeTruthy();
    act(() => {
      fireEvent.keyDown(button, { key: " " });
      fireEvent.click(button);
    });
    expect(within(header("Mutant")).getByText("descending")).toBeTruthy();
    expect(firstColumn(container)[0]).toBe("m7");
  });

  it("9.6 keeps a row with the state label not counted", () => {
    const model = fixtureModel();
    const first = model.mutants[0];
    if (first === undefined) throw new Error("fixture has no mutants");
    const extra = { ...first, id: "m8", state: "not-counted" as const };
    const { container } = setup({ ...model, mutants: [...model.mutants, extra] });
    const rows = bodyRows(container);
    expect(rows).toHaveLength(8);
    const row = rows.find((r) => r.querySelector("td")?.textContent === "m8");
    expect(within(row as HTMLElement).getByText("not counted")).toBeTruthy();
  });

  it("9.7 renders no svg, no animation and no transition", () => {
    const { container } = setup(fixtureModel());
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[style*='animation'], [style*='transition']")).toBeNull();
    expect(container.getAnimations?.() ?? []).toHaveLength(0);
  });

  it("9.8 shows the state counts of the Verdict screen's Run", () => {
    setup(fixtureModel());
    expect(screen.getByTestId("count-survivor").textContent).toBe("2");
    expect(screen.getByTestId("count-killed").textContent).toBe("3");
    expect(screen.getByTestId("count-in-the-dark").textContent).toBe("1");
    expect(screen.getByTestId("count-ghost").textContent).toBe("1");
    expect(screen.getByTestId("count-not-counted").textContent).toBe("0");
  });

  it("9.8 the spec-mutant counts on the Verdict screen are a subset of the Plain view counts", () => {
    cleanup();
    setup(fixtureModel(), <Verdict />);
    // Fixture: spec mutants m6 (survivor) and m7 (killed); strays m1 survivor, m2 and m3 killed.
    expect(screen.getByTestId("headline-surviving").textContent).toBe("1");
    expect(screen.getByTestId("headline-killed").textContent).toBe("1");
  });

  it("9.11 an empty Run shows the message and keeps the headers operable", () => {
    const { container } = setup({ ...fixtureModel(), mutants: [] });
    expect(screen.getByText("this run has no mutants")).toBeTruthy();
    expect(container.querySelectorAll("thead th")).toHaveLength(7);
    act(() => {
      fireEvent.click(header("Mutant"));
    });
    expect(within(header("Mutant")).getByText("ascending")).toBeTruthy();
  });

  it("9.1 every screen links to the Plain view", () => {
    const model = fixtureModel();
    const screens = [
      <Landing key="landing" />,
      <Verdict key="verdict" />,
      <Specimen key="specimen" mutantId="m1" />,
      <Hunt key="hunt" />,
      <PlainView key="plain" />,
    ];
    for (const node of screens) {
      const { unmount } = setup(model, node);
      const link = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "#/plain");
      expect(link).toBeDefined();
      unmount();
    }
  });
});
