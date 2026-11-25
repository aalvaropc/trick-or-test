import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { joinRun } from "../../../src/loader/join-run.js";
import { parseFile } from "../../../src/loader/parse.js";
import { buildRunModel, type RunModel } from "../../../src/loader/run-model.js";
import type { ParsedFile } from "../../../src/loader/types.js";
import { Headline } from "../../../src/screens/verdict/Headline.js";
import { readFixture } from "../../fixtures/load.js";

const parsed = (kind: "mutation-report" | "verdict", name: string, text?: string): ParsedFile => {
  const r = parseFile(kind, text ?? readFixture(name), name);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

const modelOf = (files: ParsedFile[]): RunModel => {
  const r = joinRun(files);
  if (!r.ok) throw new Error(r.error.message);
  return buildRunModel(r.value);
};

const withVerdict = (): RunModel =>
  modelOf([parsed("mutation-report", "report.json"), parsed("verdict", "verdict.json")]);

const count = (id: string): string => screen.getByTestId(id).textContent ?? "";

afterEach(cleanup);

describe("Headline", () => {
  it("6.1 shows the four integers of the fixture: 1 surviving, 1 killed, 1 guarded, 1 unguarded", () => {
    render(<Headline model={withVerdict()} />);
    expect(count("headline-surviving")).toBe("1");
    expect(count("headline-killed")).toBe("1");
    expect(count("headline-guarded")).toBe("1");
    expect(count("headline-unguarded")).toBe("1");
  });

  it("6.1 zero values render as 0", () => {
    const verdict = JSON.parse(readFixture("verdict.json")) as { coverage: unknown[] };
    verdict.coverage = [];
    const model = modelOf([
      parsed("mutation-report", "report.json"),
      parsed("verdict", "verdict.json", JSON.stringify(verdict)),
    ]);
    render(<Headline model={model} />);
    expect(count("headline-guarded")).toBe("0");
    expect(count("headline-unguarded")).toBe("0");
    expect(count("headline-surviving")).toBe("1");
  });

  it("6.14 without a Verdict_File the report counts show and the Criteria counts are absent", () => {
    render(<Headline model={modelOf([parsed("mutation-report", "report.json")])} />);
    expect(count("headline-surviving")).toBe("1");
    expect(count("headline-killed")).toBe("1");
    expect(screen.queryByTestId("headline-guarded")).toBeNull();
    expect(screen.queryByTestId("headline-unguarded")).toBeNull();
  });
});
