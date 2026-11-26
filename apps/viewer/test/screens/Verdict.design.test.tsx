import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RunProvider, useRun } from "../../src/app/run-context.js";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import { buildRunModel } from "../../src/loader/run-model.js";
import type { ParsedFile } from "../../src/loader/types.js";
import { Verdict } from "../../src/screens/Verdict.js";
import { readFixture } from "../fixtures/load.js";

const parsed = (kind: "mutation-report" | "verdict", text: string, name: string): ParsedFile => {
  const result = parseFile(kind, text, name);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const loadModel = (verdictText: string | undefined) => {
  const files = [parsed("mutation-report", readFixture("report.json"), "report.json")];
  if (verdictText !== undefined) files.push(parsed("verdict", verdictText, "verdict.json"));
  const joined = joinRun(files);
  if (!joined.ok) throw new Error(joined.error.message);
  return buildRunModel(joined.value);
};

function Loader({ verdictText }: { verdictText: string | undefined }) {
  const { applyLoad } = useRun();
  useEffect(() => {
    applyLoad({ ok: true, value: loadModel(verdictText) });
  }, [applyLoad, verdictText]);
  return null;
}

const NONE = Symbol("no verdict file");

const setup = (verdictText: string | typeof NONE = readFixture("verdict.json")) =>
  render(
    <RunProvider>
      <Loader verdictText={verdictText === NONE ? undefined : verdictText} />
      <Verdict />
    </RunProvider>,
  );

afterEach(cleanup);

describe("Verdict design", () => {
  it("13.6 the h1 is 'N monsters disagree' with N from the fixture", () => {
    setup();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("1 monster disagrees");
  });

  it("13.6 without a Verdict_File the h1 is the no-verdict title", () => {
    setup(NONE);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Mutants that survived the tests",
    );
  });

  it("13.10 the four counts are four .count items, each with a number and a label", () => {
    const { container } = setup();
    const grid = container.querySelector(".headline__counts");
    expect(grid?.tagName).toBe("DL");
    const items = [...(grid?.querySelectorAll(".count") ?? [])];
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.querySelector("dd")?.textContent).toMatch(/^\d+$/);
      expect(item.querySelector("dt")?.textContent?.length).toBeGreaterThan(0);
    }
    expect(items[0]?.className).toContain("count--surviving");
    expect(items[2]?.className).toContain("count--guarded");
  });

  it("13.20 the actions are two .button links, primary and secondary", () => {
    const { container } = setup();
    const links = [...(container.querySelectorAll(".verdict__actions a") ?? [])];
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Release the hunt", "#/hunt"],
      ["Plain table view", "#/plain"],
    ]);
    expect(links[0]?.className).toBe("button button--primary");
    expect(links[1]?.className).toBe("button button--secondary");
  });

  it("13.9 the run bar shows the facts the Verdict_File holds", () => {
    const { container } = setup();
    const bar = container.querySelector(".run-bar");
    expect(bar?.textContent).toContain("Trick or Test");
    expect(bar?.textContent).toContain("0.0.0");
    expect(bar?.textContent).toContain("9.0.0");
    expect(bar?.textContent).toContain("2026-01-03");
  });

  it("13.9 no run-bar fact is shown when the Verdict_File lacks it", () => {
    const { container } = setup(NONE);
    const bar = container.querySelector(".run-bar");
    expect(bar).not.toBeNull();
    expect(bar?.querySelectorAll(".run-bar__fact")).toHaveLength(0);
  });

  it("13.9 a blank metadata value is omitted from the run bar", () => {
    const verdict = JSON.parse(readFixture("verdict.json")) as {
      metadata: Record<string, unknown>;
    };
    verdict.metadata.strykerVersion = "";
    verdict.metadata.timestamp = "";
    const { container } = setup(JSON.stringify(verdict));
    const text = container.querySelector(".run-bar")?.textContent ?? "";
    expect(text).not.toContain("9.0.0");
    expect(text).not.toContain("2026");
    expect(text).toContain("0.0.0");
  });

  it("13.9 the lead paragraph and the two-column area exist", () => {
    const { container } = setup();
    expect(container.querySelector("p.verdict__lead")).not.toBeNull();
    const columns = container.querySelector(".verdict__columns");
    expect(columns?.querySelector(".verdict__seals .seal-grid")).not.toBeNull();
    expect(columns?.querySelector(".who-killed")).not.toBeNull();
  });
});
