import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunProvider } from "../../src/app/run-context.js";
import { Landing } from "../../src/screens/Landing.js";
import { readFixture } from "../fixtures/load.js";

const here = dirname(fileURLToPath(import.meta.url));

/** The fixture verdict with two more unguarded Criteria: 1 surviving Spec_Mutant, 3 unguarded. */
const verdictWithThreeUnguarded = (): string => {
  const verdict = JSON.parse(readFixture("verdict.json")) as {
    coverage: { criterion: string; status: string }[];
  };
  verdict.coverage.push(
    { criterion: "5.1", status: "unguarded" },
    { criterion: "5.2", status: "unguarded" },
  );
  return JSON.stringify(verdict);
};

const bodies = (): Record<string, string> => ({
  "report.json": readFixture("report.json"),
  "verdict.json": verdictWithThreeUnguarded(),
  "history.jsonl": readFixture("history.jsonl"),
});

const fileOf = (url: string): string => url.slice(url.lastIndexOf("/") + 1);

type Handler = (url: string) => Promise<Response>;

const stubFetch = (handler: Handler) => {
  const mock = vi.fn((input: string | URL | Request) => handler(String(input)));
  vi.stubGlobal("fetch", mock);
  return mock;
};

const serve = (overrides: Record<string, string> = {}): Handler => {
  const all = { ...bodies(), ...overrides };
  return async (url) => new Response(all[fileOf(url)] ?? "", { status: 200 });
};

const setup = () =>
  render(
    <RunProvider>
      <Landing />
    </RunProvider>,
  );

const pitchText = (): string => screen.getByTestId("pitch").textContent ?? "";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Landing", () => {
  it("3.1 the pitch shows the surviving Spec_Mutant count and the unguarded Criteria count", async () => {
    stubFetch(serve());
    setup();
    expect((await screen.findByTestId("pitch-survivors")).textContent).toBe("1");
    expect(screen.getByTestId("pitch-unguarded").textContent).toBe("3");
    expect(pitchText().match(/\d+/g)).toEqual(["1", "3"]);
  });

  it("3.2 a failed fetch shows the pitch without numbers and no 0", async () => {
    stubFetch(async (url) => {
      if (fileOf(url) === "report.json") throw new TypeError("Failed to fetch");
      return serve()(url);
    });
    setup();
    await screen.findByRole("alert");
    expect(pitchText().length).toBeGreaterThan(0);
    expect(pitchText()).not.toMatch(/\d/);
    expect(screen.queryByTestId("pitch-survivors")).toBeNull();
    expect(screen.queryByTestId("pitch-unguarded")).toBeNull();
  });

  it("3.2 invalid content shows the pitch without numbers and no 0", async () => {
    stubFetch(serve({ "verdict.json": "this is not json" }));
    setup();
    await screen.findByRole("alert");
    expect(pitchText()).not.toMatch(/\d/);
    expect(screen.queryByTestId("pitch-survivors")).toBeNull();
  });

  it("3.2 a Demo_Run slower than 5 seconds shows the pitch without numbers", async () => {
    vi.useFakeTimers();
    stubFetch(
      (url) =>
        new Promise((resolve) => {
          setTimeout(() => resolve(serve()(url)), 6_000);
        }),
    );
    setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(pitchText()).not.toMatch(/\d/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(pitchText()).not.toMatch(/\d/);
    // Even when the late Demo_Run finally arrives, the numbers stay out.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(pitchText()).not.toMatch(/\d/);
    expect(screen.queryByTestId("pitch-survivors")).toBeNull();
    expect(screen.getByRole("region", { name: "Load a run" })).toBeTruthy();
  });

  it("3.2 the drop zone stays usable when the Demo_Run fails", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    setup();
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Choose files" })).toBeTruthy();
  });

  it("3.3 the statement that files never leave the browser is visible", async () => {
    stubFetch(serve());
    setup();
    expect(screen.getByText(/files never leave the browser/i)).toBeTruthy();
    await screen.findByTestId("pitch-survivors");
  });

  it("3.4 the drop zone is shown", async () => {
    stubFetch(serve());
    setup();
    expect(screen.getByRole("region", { name: "Load a run" })).toBeTruthy();
    await screen.findByTestId("pitch-survivors");
  });

  it("2.1 exactly two demo links with text labels", async () => {
    stubFetch(serve());
    setup();
    const links = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("#/demo/"));
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["before the hunt", "#/demo/before"],
      ["after the hunt", "#/demo/after"],
    ]);
    await screen.findByTestId("pitch-survivors");
  });

  it("2.3 a fetch error names the file and both links stay active", async () => {
    stubFetch(async (url) => {
      if (fileOf(url) === "verdict.json") throw new TypeError("Failed to fetch");
      return serve()(url);
    });
    setup();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("demo/before/verdict.json")).toBeTruthy();
    expect(screen.getByRole("link", { name: "before the hunt" }).getAttribute("href")).toBe(
      "#/demo/before",
    );
    expect(screen.getByRole("link", { name: "after the hunt" }).getAttribute("href")).toBe(
      "#/demo/after",
    );
  });

  it("2.4 invalid content names the file and states it is invalid", async () => {
    stubFetch(serve({ "report.json": "{ not json" }));
    setup();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("demo/before/report.json")).toBeTruthy();
    expect(alert.textContent).toMatch(/invalid/i);
    expect(screen.getAllByRole("link", { name: /the hunt$/ })).toHaveLength(2);
  });

  it("2.9 the error leaves both demo links without a disabled state", async () => {
    stubFetch(async () => new Response("", { status: 404 }));
    setup();
    await screen.findByRole("alert");
    for (const name of ["before the hunt", "after the hunt"]) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("aria-disabled")).toBeNull();
      expect(link.getAttribute("href")).toMatch(/^#\/demo\//);
    }
  });

  it("10.3 both font licences are shown", async () => {
    stubFetch(serve());
    setup();
    expect(screen.getByText("IM Fell English")).toBeTruthy();
    expect(screen.getByText("JetBrains Mono")).toBeTruthy();
    expect(document.body.textContent).toContain("SIL Open Font License");
    await screen.findByTestId("pitch-survivors");
  });

  it("3.6 the source has no digit in any string or text of the pitch", () => {
    const source = readFileSync(join(here, "../../src/screens/Landing.tsx"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const texts = code.match(/"[^"\n]*"|`[^`]*`|>[^<>{}\n]+</g) ?? [];
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) expect(text).not.toMatch(/\d/);
  });
});
