import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { historyRecordSchema, mutationReportSchema, verdictSchema } from "trick-or-test/report";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimeline } from "../../src/hunt/timeline.js";
import { fetchDemoRun } from "../../src/loader/fetch-demo-run.js";
import { buildRunModel } from "../../src/loader/run-model.js";

const here = dirname(fileURLToPath(import.meta.url));
const viewerRoot = resolve(here, "../..");
const repoRoot = resolve(viewerRoot, "../..");
const demoDir = join(viewerRoot, "public", "demo");

const RUNS = ["before", "after"] as const;
const FILE_NAMES = ["mutation-report.json", "verdict.json", "history.jsonl"] as const;
const OATHBREAKER = "oath-7.4-negative-discount-allowed";

const read = (run: string, name: string): string => readFileSync(join(demoDir, run, name), "utf8");
const lines = (text: string): string[] => text.split("\n").filter((l) => l.trim() !== "");

const verdictEntry = (run: string) => {
  const verdict = verdictSchema.parse(JSON.parse(read(run, "verdict.json")));
  return verdict.mutants.find((m) => m.id === OATHBREAKER);
};

describe("demo files", () => {
  for (const run of RUNS) {
    it(`14.1 ${run} has the three engine-named files and each parses with its schema`, () => {
      for (const name of FILE_NAMES) expect(() => read(run, name)).not.toThrow();
      expect(
        mutationReportSchema.safeParse(JSON.parse(read(run, "mutation-report.json"))).success,
      ).toBe(true);
      expect(verdictSchema.safeParse(JSON.parse(read(run, "verdict.json"))).success).toBe(true);
      for (const line of lines(read(run, "history.jsonl"))) {
        expect(historyRecordSchema.safeParse(JSON.parse(line)).success).toBe(true);
      }
    });

    it(`14.10 ${run} files hold no machine path and no working-folder name`, () => {
      const forbidden: [string, (text: string) => boolean][] = [
        ["/home/", (t) => t.includes("/home/")],
        ["/Users/", (t) => t.includes("/Users/")],
        ["/tmp/", (t) => t.includes("/tmp/")],
        ["drive letter path", (t) => /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/.test(t)],
        ["repository root", (t) => t.includes(repoRoot)],
        [".trickortest", (t) => t.includes(".trickortest")],
      ];
      for (const name of FILE_NAMES) {
        const text = read(run, name);
        for (const [label, found] of forbidden) {
          expect(found(text), `${run}/${name} contains ${label}`).toBe(false);
        }
      }
    });
  }

  it("14.7 the after history has two lines and the first equals the before line", () => {
    const before = lines(read("before", "history.jsonl"));
    const after = lines(read("after", "history.jsonl"));
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
    expect(after[0]).toBe(before[0]);
  });

  it("14.9 oath-7.4-negative-discount-allowed survives before and is killed after", () => {
    expect(verdictEntry("before")?.status).toBe("Survived");
    expect(verdictEntry("after")?.status).toBe("Killed");
    const second = lines(read("after", "history.jsonl"))[1] ?? "";
    const record = historyRecordSchema.parse(JSON.parse(second));
    expect(record.newlyKilledIds).toContain(OATHBREAKER);
  });
});

describe("demo runs through fetchDemoRun", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("14.9 loads both runs from disk and the after Run_Model has two timeline entries", async () => {
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = String(input);
      const marker = "/demo/";
      const path = url.slice(url.indexOf(marker) + marker.length);
      try {
        return new Response(readFileSync(join(demoDir, path), "utf8"), { status: 200 });
      } catch {
        return new Response("", { status: 404 });
      }
    });

    const before = await fetchDemoRun("before", "/trick-or-test/");
    const after = await fetchDemoRun("after", "/trick-or-test/");
    expect(before.ok).toBe(true);
    expect(after.ok).toBe(true);
    if (!before.ok || !after.ok) return;

    expect(buildTimeline(buildRunModel(before.value).history)).toHaveLength(1);
    const afterModel = buildRunModel(after.value);
    expect(buildTimeline(afterModel.history)).toHaveLength(2);
    expect(afterModel.mutants.find((m) => m.id === OATHBREAKER)?.state).toBe("killed");
  });
});
