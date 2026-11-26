import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDemoRun } from "../../src/loader/fetch-demo-run.js";
import { readFixture } from "../fixtures/load.js";

const BASE = "/trick-or-test/";

const bodies: Record<string, string> = {
  "mutation-report.json": readFixture("report.json"),
  "verdict.json": readFixture("verdict.json"),
  "history.jsonl": readFixture("history.jsonl"),
};

const fileOf = (url: string): string => url.slice(url.lastIndexOf("/") + 1);

type Handler = (url: string, init: RequestInit) => Promise<Response>;

const stubFetch = (handler: Handler) => {
  const mock = vi.fn((input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init ?? {}),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
};

const serveFixtures: Handler = async (url) =>
  new Response(bodies[fileOf(url)] ?? "", { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetch-demo-run", () => {
  it("2.5 every request is GET with no body", async () => {
    const mock = stubFetch(serveFixtures);
    const result = await fetchDemoRun("before", BASE);
    expect(result.ok).toBe(true);
    expect(mock).toHaveBeenCalledTimes(3);
    for (const call of mock.mock.calls) {
      expect(call[1]?.method).toBe("GET");
      expect(call[1]?.body).toBeUndefined();
    }
  });

  it("2.2 and 12.11 URLs are same-origin paths under the base path", async () => {
    const mock = stubFetch(serveFixtures);
    await fetchDemoRun("after", BASE);
    const urls = mock.mock.calls.map((c) => String(c[0]));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith("/trick-or-test/demo/after/")).toBe(true);
      expect(url.startsWith("//")).toBe(false);
      expect(url).not.toMatch(/^[a-z]+:/i);
    }
  });

  it("2.2 the joined run holds the fixture report", async () => {
    stubFetch(serveFixtures);
    const result = await fetchDemoRun("before", BASE);
    if (!result.ok) throw new Error(result.error.message);
    expect(Object.keys(result.value.report.files).length).toBeGreaterThan(0);
    expect(result.value.history.length).toBeGreaterThan(0);
  });

  it("2.3 a network failure names the file", async () => {
    stubFetch(async (url) => {
      if (fileOf(url) === "verdict.json") throw new TypeError("Failed to fetch");
      return serveFixtures(url, {});
    });
    const result = await fetchDemoRun("before", BASE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fileName).toContain("verdict.json");
    expect(result.error.message).toContain("verdict.json");
  });

  it("2.3 a 404 response names the file", async () => {
    stubFetch(async (url) =>
      fileOf(url) === "history.jsonl"
        ? new Response("nope", { status: 404 })
        : serveFixtures(url, {}),
    );
    const result = await fetchDemoRun("after", BASE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fileName).toContain("history.jsonl");
    expect(result.error.message).toContain("history.jsonl");
  });

  it("2.3 no response within 10 seconds names the file", async () => {
    vi.useFakeTimers();
    stubFetch(
      (url, init) =>
        new Promise<Response>((resolve, reject) => {
          if (fileOf(url) !== "mutation-report.json") {
            resolve(new Response("", { status: 200 }));
            return;
          }
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const pending = fetchDemoRun("before", BASE);
    await vi.advanceTimersByTimeAsync(9_999);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fileName).toContain("mutation-report.json");
    expect(result.error.message).toContain("mutation-report.json");
  });

  it("2.4 invalid content names the file and says it is invalid", async () => {
    stubFetch(async (url) =>
      fileOf(url) === "mutation-report.json"
        ? new Response("{ not json", { status: 200 })
        : serveFixtures(url, {}),
    );
    const result = await fetchDemoRun("before", BASE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fileName).toContain("mutation-report.json");
    expect(result.error.message).toContain("mutation-report.json");
    expect(result.error.message).toMatch(/invalid/i);
  });
});
