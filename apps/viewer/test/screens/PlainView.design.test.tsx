import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RunProvider, useRun } from "../../src/app/run-context.js";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import { buildRunModel, type RunModel } from "../../src/loader/run-model.js";
import type { ParsedFile } from "../../src/loader/types.js";
import { PlainView } from "../../src/screens/PlainView.js";
import { readFixture } from "../fixtures/load.js";

const parsed = (kind: "mutation-report" | "verdict", name: string): ParsedFile => {
  const result = parseFile(kind, readFixture(name), name);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const model = (): RunModel => {
  const joined = joinRun([
    parsed("mutation-report", "report.json"),
    parsed("verdict", "verdict.json"),
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

const open = () =>
  render(
    <RunProvider>
      <Loader value={model()} />
      <PlainView />
    </RunProvider>,
  );

afterEach(cleanup);

describe("PlainView design", () => {
  it("13.6 the h1 is 'Plain view'", () => {
    open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Plain view");
  });

  it("13.17 the table sits directly inside .table-scroll", () => {
    const { container } = open();
    const scroll = container.querySelector(".table-scroll");
    expect(scroll?.querySelector(":scope > table")).not.toBeNull();
    expect(container.querySelectorAll("table")).toHaveLength(1);
  });

  it("9.9 every column header holds a button", () => {
    const { container } = open();
    const headers = [...container.querySelectorAll("thead th")];
    expect(headers).toHaveLength(7);
    for (const th of headers) {
      expect(th.querySelector(":scope > button[type='button']")).not.toBeNull();
    }
  });

  it("9.7 the screen draws no svg", () => {
    const { container } = open();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector(".creature")).toBeNull();
  });

  it("9.7 the screen has no inline transition or animation", () => {
    const { container } = open();
    expect(container.querySelector("[style*='transition']")).toBeNull();
    expect(container.querySelector("[style*='animation']")).toBeNull();
  });
});
