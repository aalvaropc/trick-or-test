import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import type { HistoryRecord } from "trick-or-test/report";
import { afterEach, describe, expect, it } from "vitest";
import { RunProvider, useRun } from "../../src/app/run-context.js";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import { buildRunModel, type RunModel } from "../../src/loader/run-model.js";
import type { ParsedFile } from "../../src/loader/types.js";
import { Hunt } from "../../src/screens/Hunt.js";
import { readFixture } from "../fixtures/load.js";

const parsed = (kind: "mutation-report" | "history", name: string): ParsedFile => {
  const result = parseFile(kind, readFixture(name), name);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const loadModel = (withHistory: boolean): RunModel => {
  const files = [parsed("mutation-report", "report.json")];
  if (withHistory) files.push(parsed("history", "history.jsonl"));
  const joined = joinRun(files);
  if (!joined.ok) throw new Error(joined.error.message);
  return buildRunModel(joined.value);
};

const withHistory = (model: RunModel, history: HistoryRecord[]): RunModel => ({
  ...model,
  history,
});

function Loader({ model }: { model: RunModel }) {
  const { applyLoad } = useRun();
  useEffect(() => {
    applyLoad({ ok: true, value: model });
  }, [applyLoad, model]);
  return null;
}

const setup = (model: RunModel) =>
  render(
    <RunProvider>
      <Loader model={model} />
      <Hunt />
    </RunProvider>,
  );

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("Hunt", () => {
  it("8.1 shows one entry per record, oldest first, equal times in file order", () => {
    const { container } = setup(loadModel(true));
    const items = [...container.querySelectorAll("ol.hunt__timeline > li")];
    const commits = items.map((li) => li.querySelector(".hunt__commit")?.textContent);
    expect(commits).toEqual(["aaa1111", "bbb2222", "ccc3333", "ddd4444"]);
  });

  it("8.2 shows the run time, git commit, killed creatures and survivor count", () => {
    const { container } = setup(loadModel(true));
    const second = container.querySelectorAll("ol.hunt__timeline > li")[1] as HTMLElement;
    expect(within(second).getByText("2026-01-02T00:00:00.000Z")).toBeTruthy();
    expect(within(second).getByText("bbb2222")).toBeTruthy();
    expect(second.querySelectorAll("a.creature-link")).toHaveLength(1);
    expect(second.querySelector(".hunt__survivors")?.textContent).toContain("1");
  });

  it("8.3 the survivor count of each entry is statusCounts.Survived of its record", () => {
    const { container } = setup(loadModel(true));
    const counts = [...container.querySelectorAll(".hunt__survivors-count")].map(
      (el) => el.textContent,
    );
    expect(counts).toEqual(["2", "1", "1", "0"]);
  });

  it("8.12 a survivor count that differs from the mutants list still follows statusCounts", () => {
    const model = loadModel(true);
    const first = model.history[0] as HistoryRecord;
    const changed = {
      ...first,
      statusCounts: { ...first.statusCounts, Survived: 7 },
    };
    const { container } = setup(withHistory(model, [changed]));
    expect(container.querySelector(".hunt__survivors-count")?.textContent).toBe("7");
  });

  it("8.4 activating a creature opens the Specimen route", () => {
    setup(loadModel(true));
    const link = screen
      .getAllByRole("link")
      .find((l) => l.getAttribute("href")?.startsWith("#/mutant/"));
    expect(link).toBeDefined();
    act(() => {
      fireEvent.click(link as HTMLElement);
    });
    expect(window.location.hash).toBe("#/mutant/m2");
  });

  it("8.5 an id missing from the run is plain text and not a link", () => {
    const model = loadModel(true);
    const first = model.history[0] as HistoryRecord;
    const record = {
      ...first,
      newlyKilledIds: ["gone-mutant"],
    } as unknown as HistoryRecord;
    const { container } = setup(withHistory(model, [record]));
    const missing = screen.getByText("gone-mutant");
    expect(missing.closest("a")).toBeNull();
    expect(missing.closest("button")).toBeNull();
    expect(container.querySelectorAll("a.creature-link")).toHaveLength(0);
  });

  it("8.8 a run loaded without a History_File shows the no history message and no entries", () => {
    const { container } = setup(loadModel(false));
    expect(screen.getByText("no history was loaded")).toBeTruthy();
    expect(container.querySelector("ol")).toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });

  it("8.10 an explicit empty history list shows the no history message and no entries", () => {
    const { container } = setup(withHistory(loadModel(true), []));
    expect(screen.getByText("no history was loaded")).toBeTruthy();
    expect(container.querySelector("ol")).toBeNull();
  });

  it("8.8 with no run loaded shows no entries", () => {
    const { container } = render(
      <RunProvider>
        <Hunt />
      </RunProvider>,
    );
    expect(container.querySelector("ol")).toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });

  it("8.9 the timeline is an ordered list and nothing in the screen has an animation class", () => {
    const { container } = setup(loadModel(true));
    expect(container.querySelectorAll("ol.hunt__timeline")).toHaveLength(1);
    expect(container.querySelector('[class*="anim"]')).toBeNull();
    expect(container.querySelector("[style*='animation']")).toBeNull();
    expect(container.querySelector("[style*='transition']")).toBeNull();
  });

  it("8.11 the number of entries equals the number of records", () => {
    const model = loadModel(true);
    const { container } = setup(model);
    expect(container.querySelectorAll("ol.hunt__timeline > li")).toHaveLength(4);
    expect(model.history).toHaveLength(4);
  });

  it("10.11 has exactly one h1 and sets the document title", () => {
    const { container } = setup(loadModel(true));
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("[data-screen]")?.getAttribute("data-screen")).toBe("hunt");
    expect(document.title).toBe("Hunt - Trick or Test");
  });
});
