import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { readFixture } from "./fixtures/load.js";

const crash = vi.hoisted(() => ({ on: false }));

vi.mock("../src/screens/Verdict.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/screens/Verdict.js")>();
  return {
    ...actual,
    Verdict: () => {
      if (crash.on) throw new Error("boom");
      return actual.Verdict();
    },
  };
});

const fileOf = (url: string): string => url.slice(url.lastIndexOf("/") + 1);

const bodies = (): Record<string, string> => ({
  "report.json": readFixture("report.json"),
  "verdict.json": readFixture("verdict.json"),
  "history.jsonl": readFixture("history.jsonl"),
});

const stubFetch = (overrides: Record<string, string> = {}) => {
  const all = { ...bodies(), ...overrides };
  const mock = vi.fn(
    async (input: string | URL | Request) =>
      new Response(all[fileOf(String(input))] ?? "", { status: 200 }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
};

const goto = async (hash: string) => {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
};

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;

const openDemo = async () => {
  window.location.hash = "#/demo/before";
  const view = render(<App />);
  await waitFor(() => expect(window.location.hash).toBe("#/verdict"));
  await waitFor(() => expect(heading()).toBe("Verdict"));
  return view;
};

beforeEach(() => {
  window.location.hash = "";
  crash.on = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("2.2 #/demo/before fetches the demo run and opens the Verdict", async () => {
    const fetchMock = stubFetch();
    await openDemo();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("demo/before/report.json"))).toBe(true);
  });

  it("2.7 #/demo/after fetches the after run and opens the Verdict", async () => {
    const fetchMock = stubFetch();
    window.location.hash = "#/demo/after";
    render(<App />);
    await waitFor(() => expect(window.location.hash).toBe("#/verdict"));
    await waitFor(() => expect(heading()).toBe("Verdict"));
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("demo/after/report.json"))).toBe(true);
  });

  it("2.8 a remount on the demo route fetches the demo run again", async () => {
    const fetchMock = stubFetch();
    const first = await openDemo();
    first.unmount();
    const countOf = () =>
      fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("demo/before/report.json"))
        .length;
    const before = countOf();
    window.location.hash = "#/demo/before";
    render(<App />);
    await waitFor(() => expect(countOf()).toBeGreaterThan(before));
    await waitFor(() => expect(window.location.hash).toBe("#/verdict"));
  });

  it("2.9 a failed demo fetch shows Landing with the error and both demo links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    window.location.hash = "#/demo/after";
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("demo/after/report.json");
    expect(heading()).toBe("Landing");
    expect(window.location.hash).toBe("#/demo/after");
    expect(screen.getByRole("link", { name: "before the hunt" }).getAttribute("href")).toBe(
      "#/demo/before",
    );
    expect(screen.getByRole("link", { name: "after the hunt" }).getAttribute("href")).toBe(
      "#/demo/after",
    );
  });

  it("2.9 invalid demo content shows Landing with the error", async () => {
    stubFetch({ "verdict.json": "this is not json" });
    window.location.hash = "#/demo/after";
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("demo/after/verdict.json");
    expect(alert.textContent).toMatch(/invalid/i);
    expect(heading()).toBe("Landing");
  });

  it("11.4 a mutant route with a Run shows the Specimen", async () => {
    stubFetch();
    await openDemo();
    await goto("#/mutant/m1");
    expect(heading()).toBe("Specimen");
    expect(screen.getByText("m1")).toBeTruthy();
  });

  it("11.5 an unknown mutant id shows Landing with mutant not found and keeps the Run", async () => {
    stubFetch();
    await openDemo();
    await goto("#/mutant/nope");
    expect(heading()).toBe("Landing");
    expect(screen.getByText(/mutant not found/)).toBeTruthy();
    await goto("#/verdict");
    expect(heading()).toBe("Verdict");
  });

  it("11.6 a route that needs a Run with none loaded shows no run is open", async () => {
    stubFetch();
    for (const hash of ["#/verdict", "#/hunt", "#/plain", "#/mutant/m1"]) {
      window.location.hash = hash;
      const view = render(<App />);
      expect(heading()).toBe("Landing");
      expect(screen.getByText(/no run is open/)).toBeTruthy();
      view.unmount();
    }
  });

  it("11.7 an unknown route shows Landing", async () => {
    stubFetch();
    window.location.hash = "#/nowhere";
    render(<App />);
    expect(heading()).toBe("Landing");
    expect(screen.queryByText(/no run is open/)).toBeNull();
  });

  it("11.8 a remount on a non-demo route starts with no Run", async () => {
    stubFetch();
    const view = await openDemo();
    view.unmount();
    expect(window.location.hash).toBe("#/verdict");
    render(<App />);
    expect(heading()).toBe("Landing");
    expect(screen.getByText(/no run is open/)).toBeTruthy();
  });

  it("12.14 a thrown render error is shown and the app stays up", async () => {
    stubFetch();
    await openDemo();
    await goto("#/plain");
    crash.on = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await goto("#/verdict");
    errors.mockRestore();
    expect(screen.getByRole("alert").textContent).toContain("could not be shown");
    crash.on = false;
    await goto("#/plain");
    expect(heading()).toBe("Plain view");
  });

  it("1.7 a failed local load keeps the previous Run", async () => {
    stubFetch();
    await openDemo();
    await goto("#/");
    expect(heading()).toBe("Landing");
    fireEvent.drop(screen.getByRole("region", { name: "Load a run" }), {
      dataTransfer: { files: [new File(["{ not json"], "broken.json")] },
    });
    expect(await screen.findByText("broken.json")).toBeTruthy();
    await goto("#/verdict");
    expect(heading()).toBe("Verdict");
  });
});
