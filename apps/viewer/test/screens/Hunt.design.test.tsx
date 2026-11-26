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

const model = (): RunModel => {
  const joined = joinRun([
    parsed("mutation-report", "report.json"),
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

const open = (value: RunModel = model(), lockLog: { time: string; file: string }[] = []) =>
  render(
    <RunProvider>
      <Loader value={value} />
      <Hunt lockLog={lockLog} />
    </RunProvider>,
  );

afterEach(cleanup);

describe("Hunt design", () => {
  it("13.6 the h1 is 'The hunt'", () => {
    open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("The hunt");
  });

  it("13.17 each entry shows time, commit and survivor label", () => {
    const { container } = open();
    const entries = [...container.querySelectorAll("ol.hunt__timeline > li")];
    expect(entries).toHaveLength(4);
    const second = entries[1] as HTMLElement;
    expect(second.querySelector("time.hunt__time")?.textContent).toBe("2026-01-02T00:00:00.000Z");
    expect(second.querySelector("code.hunt__commit")?.textContent).toBe("bbb2222");
    expect(second.querySelector(".hunt__survivors")?.textContent).toBe(
      "survivors after this run: 1",
    );
  });

  it("13.17 the killed creatures sit in one list inside the entry", () => {
    const { container } = open();
    const second = container.querySelectorAll("ol.hunt__timeline > li")[1] as HTMLElement;
    const list = second.querySelector("ul.hunt__killed");
    expect(list?.querySelectorAll("a.creature-link")).toHaveLength(1);
  });

  it("13.18 every killed creature is drawn at the Hunt size", () => {
    const { container } = open();
    const svgs = [...container.querySelectorAll(".hunt__killed .creature svg")];
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(svg.getAttribute("width")).toBe("48");
      expect(svg.getAttribute("height")).toBe("48");
    }
  });

  it("13.17 a blocked attempt carries the label 'blocked' in amber", () => {
    const { container } = open(model(), [{ time: "2026-01-01T12:00:00.000Z", file: "a.test.ts" }]);
    const blocked = container.querySelector(".hunt__blocked") as HTMLElement;
    expect(blocked.querySelector("strong")?.textContent).toBe("blocked");
    expect(blocked.classList.contains("hunt__blocked")).toBe(true);
  });

  it("8.9 the screen has no animation or transition inline", () => {
    const { container } = open();
    expect(container.querySelector("[style*='animation']")).toBeNull();
    expect(container.querySelector("[style*='transition']")).toBeNull();
  });
});
