import { cleanup, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunProvider } from "../../src/app/run-context.js";
import { fetchDemoRun } from "../../src/loader/fetch-demo-run.js";
import { Landing } from "../../src/screens/Landing.js";
import { readFixture } from "../fixtures/load.js";

const BASE = "/trick-or-test/";

const bodies: Record<string, string> = {
  "mutation-report.json": readFixture("report.json"),
  "verdict.json": readFixture("verdict.json"),
  "history.jsonl": readFixture("history.jsonl"),
};

const fileOf = (url: string): string => url.slice(url.lastIndexOf("/") + 1);

const stubFetch = (handler: (url: string) => Response) => {
  const mock = vi.fn(async (input: string | URL | Request) => handler(String(input)));
  vi.stubGlobal("fetch", mock);
  return mock;
};

const serve = (url: string): Response => new Response(bodies[fileOf(url)] ?? "", { status: 200 });

const requested = (mock: ReturnType<typeof stubFetch>): string[] =>
  mock.mock.calls.map((call) => String(call[0]));

const renderLanding = () => render(createElement(RunProvider, null, createElement(Landing)));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("fetch-demo-run engine file names", () => {
  it("14.1 the before run requests the engine's three names under demo/before/", async () => {
    const mock = stubFetch(serve);
    const result = await fetchDemoRun("before", BASE);
    expect(result.ok).toBe(true);
    expect(requested(mock)).toEqual([
      "/trick-or-test/demo/before/mutation-report.json",
      "/trick-or-test/demo/before/verdict.json",
      "/trick-or-test/demo/before/history.jsonl",
    ]);
  });

  it("14.1 the after run requests the engine's three names under demo/after/", async () => {
    const mock = stubFetch(serve);
    const result = await fetchDemoRun("after", BASE);
    expect(result.ok).toBe(true);
    expect(requested(mock)).toEqual([
      "/trick-or-test/demo/after/mutation-report.json",
      "/trick-or-test/demo/after/verdict.json",
      "/trick-or-test/demo/after/history.jsonl",
    ]);
  });

  it("14.1 no request is made for report.json", async () => {
    const mock = stubFetch(serve);
    await fetchDemoRun("before", BASE);
    expect(requested(mock).filter((url) => fileOf(url) === "report.json")).toEqual([]);
  });

  it("14.1 and 2.3 a missing mutation-report.json names that file", async () => {
    stubFetch((url) =>
      fileOf(url) === "mutation-report.json" ? new Response("nope", { status: 404 }) : serve(url),
    );
    const result = await fetchDemoRun("before", BASE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fileName).toBe("demo/before/mutation-report.json");
    expect(result.error.message).toContain("mutation-report.json");
    expect(result.error.message).toContain("404");
  });

  it("14.1 and 2.4 an invalid mutation-report.json names that file", async () => {
    stubFetch((url) =>
      fileOf(url) === "mutation-report.json"
        ? new Response("{ not json", { status: 200 })
        : serve(url),
    );
    const result = await fetchDemoRun("after", BASE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fileName).toBe("demo/after/mutation-report.json");
    expect(result.error.message).toContain("mutation-report.json");
    expect(result.error.message).toMatch(/invalid/i);
  });

  it("14.1 and 2.3 Landing stays and names mutation-report.json when it is missing", async () => {
    stubFetch((url) =>
      fileOf(url) === "mutation-report.json" ? new Response("nope", { status: 404 }) : serve(url),
    );
    renderLanding();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("demo/before/mutation-report.json")).toBeTruthy();
    expect(document.querySelector('[data-screen="landing"]')).not.toBeNull();
    expect(screen.getAllByRole("link", { name: /the hunt$/ })).toHaveLength(2);
  });

  it("14.1 and 2.4 Landing stays and names mutation-report.json when it is invalid", async () => {
    stubFetch((url) =>
      fileOf(url) === "mutation-report.json"
        ? new Response("{ not json", { status: 200 })
        : serve(url),
    );
    renderLanding();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("demo/before/mutation-report.json")).toBeTruthy();
    expect(alert.textContent).toMatch(/invalid/i);
    expect(document.querySelector('[data-screen="landing"]')).not.toBeNull();
  });
});
