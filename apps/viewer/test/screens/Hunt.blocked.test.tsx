import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
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

const loadModel = (): RunModel => {
  const joined = joinRun([
    parsed("mutation-report", "report.json"),
    parsed("history", "history.jsonl"),
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

const setup = (lockLog?: { time: string; file: string }[]) =>
  render(
    <RunProvider>
      <Loader model={loadModel()} />
      {lockLog === undefined ? <Hunt /> : <Hunt lockLog={lockLog} />}
    </RunProvider>,
  );

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("Hunt blocked attempts", () => {
  it("8.6 each blocked write attempt shows the label blocked in the amber token", () => {
    const { container } = setup([
      { time: "2026-01-01T12:00:00.000Z", file: "test/cart.test.ts" },
      { time: "2026-01-02T12:00:00.000Z", file: "src/cart.ts" },
    ]);
    const blocked = [...container.querySelectorAll(".hunt__blocked")] as HTMLElement[];
    expect(blocked).toHaveLength(2);
    for (const el of blocked) {
      expect(el.textContent).toContain("blocked");
      expect(el.getAttribute("style")).toContain("var(--amber)");
    }
    expect(screen.getByText("test/cart.test.ts")).toBeTruthy();
    expect(screen.getByText("src/cart.ts")).toBeTruthy();
  });

  it("8.6 blocked attempts sit on the timeline between runs by time", () => {
    const { container } = setup([{ time: "2026-01-01T12:00:00.000Z", file: "src/cart.ts" }]);
    const items = [...container.querySelectorAll("ol.hunt__timeline > li")];
    expect(items).toHaveLength(5);
    expect(items[1]?.classList.contains("hunt__blocked")).toBe(true);
  });

  it("8.7 with no Lock_Log the timeline shows no blocked entries and no error", () => {
    const { container } = setup();
    expect(container.querySelectorAll(".hunt__blocked")).toHaveLength(0);
    expect(screen.queryByText("blocked")).toBeNull();
    expect(container.querySelectorAll("ol.hunt__timeline > li")).toHaveLength(4);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
