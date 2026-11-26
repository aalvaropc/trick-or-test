import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RunProvider, useRun } from "../../src/app/run-context.js";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import { buildRunModel } from "../../src/loader/run-model.js";
import type { ParsedFile } from "../../src/loader/types.js";
import { Verdict } from "../../src/screens/Verdict.js";
import { readFixture } from "../fixtures/load.js";

const parsed = (kind: "mutation-report" | "verdict", name: string): ParsedFile => {
  const result = parseFile(kind, readFixture(name), name);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const loadModel = (withVerdict: boolean) => {
  const files = [parsed("mutation-report", "report.json")];
  if (withVerdict) files.push(parsed("verdict", "verdict.json"));
  const joined = joinRun(files);
  if (!joined.ok) throw new Error(joined.error.message);
  return buildRunModel(joined.value);
};

function Loader({ withVerdict }: { withVerdict: boolean }) {
  const { applyLoad } = useRun();
  useEffect(() => {
    applyLoad({ ok: true, value: loadModel(withVerdict) });
  }, [applyLoad, withVerdict]);
  return null;
}

const setup = (withVerdict: boolean) =>
  render(
    <RunProvider>
      <Loader withVerdict={withVerdict} />
      <Verdict />
    </RunProvider>,
  );

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("Verdict", () => {
  it("6.1 shows the headline, seals, who-killed panel, strays and species legend", () => {
    const { container } = setup(true);
    expect(container.querySelector(".headline")).not.toBeNull();
    expect(container.querySelector(".seal-grid")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Who killed them" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Strays" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Species" })).toBeTruthy();
    expect(screen.queryByText("no verdict file was loaded")).toBeNull();
  });

  it("6.13 activating a creature opens the Specimen route", () => {
    setup(true);
    const link = screen
      .getAllByRole("link")
      .find((l) => l.getAttribute("href")?.startsWith("#/mutant/"));
    expect(link).toBeDefined();
    const href = (link as HTMLElement).getAttribute("href");
    act(() => {
      fireEvent.click(link as HTMLElement);
    });
    expect(window.location.hash).toBe(href);
  });

  it("6.14 without a Verdict_File shows the headline and the message but no seals or panel", () => {
    const { container } = setup(false);
    expect(container.querySelector(".headline")).not.toBeNull();
    expect(screen.getByText("no verdict file was loaded")).toBeTruthy();
    expect(container.querySelector(".seal-grid")).toBeNull();
    expect(container.querySelector(".seal")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Who killed them" })).toBeNull();
  });

  it("10.11 has exactly one h1 and sets the document title", () => {
    const { container } = setup(true);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("[data-screen]")?.getAttribute("data-screen")).toBe("verdict");
    expect(document.title).toBe("Verdict - Trick or Test");
  });
});
