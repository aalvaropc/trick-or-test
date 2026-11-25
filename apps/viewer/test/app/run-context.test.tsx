import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RunProvider, useHashRoute, useRun } from "../../src/app/run-context.js";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import { buildRunModel, type RunModel } from "../../src/loader/run-model.js";
import type { LoadError, Result } from "../../src/loader/types.js";
import { readFixture } from "../fixtures/load.js";

const loadFixture = (): Result<RunModel, LoadError> => {
  const report = parseFile("mutation-report", readFixture("report.json"), "report.json");
  if (!report.ok) return report;
  const verdict = parseFile("verdict", readFixture("verdict.json"), "verdict.json");
  if (!verdict.ok) return verdict;
  const raw = joinRun([report.value, verdict.value]);
  if (!raw.ok) return raw;
  return { ok: true, value: buildRunModel(raw.value) };
};

const wrapper = ({ children }: { children: ReactNode }) => <RunProvider>{children}</RunProvider>;

const Probe = () => {
  const { run, applyLoad } = useRun();
  return (
    <button type="button" onClick={() => applyLoad(loadFixture())}>
      {run === undefined ? "no run" : "has run"}
    </button>
  );
};

afterEach(() => {
  window.location.hash = "";
});

describe("run context", () => {
  it("1.7 a failed load keeps the previous Run", () => {
    const { result } = renderHook(() => useRun(), { wrapper });
    const loaded = loadFixture();
    act(() => result.current.applyLoad(loaded));
    const first = result.current.run;
    expect(first).toBeDefined();

    act(() =>
      result.current.applyLoad({
        ok: false,
        error: { fileName: "bad.json", message: "invalid JSON" },
      }),
    );
    expect(result.current.run).toBe(first);
  });

  it("11.3 a hash change updates the route", () => {
    window.location.hash = "#/plain";
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toEqual({ kind: "plain" });

    act(() => {
      window.location.hash = "#/mutant/m1";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current).toEqual({ kind: "specimen", mutantId: "m1" });
  });

  it("11.8 a remount discards the Run on a non-demo route", () => {
    window.location.hash = "#/plain";
    const first = render(
      <RunProvider>
        <Probe />
      </RunProvider>,
    );
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("has run");
    first.unmount();

    render(
      <RunProvider>
        <Probe />
      </RunProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("no run");
  });

  it("11.9 loading a fixture writes nothing to localStorage, sessionStorage or cookies", () => {
    localStorage.clear();
    sessionStorage.clear();
    const cookieBefore = document.cookie;
    const { result } = renderHook(() => useRun(), { wrapper });
    act(() => result.current.applyLoad(loadFixture()));
    expect(result.current.run).toBeDefined();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe(cookieBefore);
  });
});
