import type { HistoryRecord } from "trick-or-test/report";
import { historyRecordSchema } from "trick-or-test/report";
import { describe, expect, it } from "vitest";
import { buildTimeline } from "../../src/hunt/timeline.js";
import { readFixture } from "../fixtures/load.js";

const records = (): HistoryRecord[] =>
  readFixture("history.jsonl")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => historyRecordSchema.parse(JSON.parse(l)));

describe("buildTimeline", () => {
  it("8.11 entry count equals record count", () => {
    expect(buildTimeline(records())).toHaveLength(4);
    expect(buildTimeline([])).toEqual([]);
  });

  it("8.3 and 8.12 survivors equal statusCounts.Survived", () => {
    const recs = records();
    const timeline = buildTimeline(recs);
    expect(timeline.map((e) => e.survivors)).toEqual(recs.map((r) => r.statusCounts.Survived));
    expect(timeline.map((e) => e.survivors)).toEqual([2, 1, 1, 0]);
  });

  it("8.2 each entry holds time, git commit, newly killed ids and survivors", () => {
    const [first, second] = buildTimeline(records());
    expect(first).toEqual({
      time: "2026-01-01T00:00:00.000Z",
      gitCommit: "aaa1111",
      newlyKilledIds: [],
      survivors: 2,
    });
    expect(second?.newlyKilledIds).toEqual(["m2"]);
  });

  it("8.1 orders by time ascending and keeps file order for equal time", () => {
    const [r0, r1, r2, r3] = records() as [
      HistoryRecord,
      HistoryRecord,
      HistoryRecord,
      HistoryRecord,
    ];
    const input = [r3, r2, r1, r0];
    const copy = [...input];
    const commits = buildTimeline(input).map((e) => e.gitCommit);
    // r2 precedes r1 in the input, so it stays first among the equal times.
    expect(commits).toEqual(["aaa1111", "ccc3333", "bbb2222", "ddd4444"]);
    expect(input).toEqual(copy);
  });
});
