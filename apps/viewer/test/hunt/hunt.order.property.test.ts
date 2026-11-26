// Feature: bestiary-viewer, Property V9: Hunt is ordered
import fc from "fast-check";
import type { HistoryRecord, MutantId } from "trick-or-test/report";
import { describe, expect, it } from "vitest";
import { buildTimeline } from "../../src/hunt/timeline.js";
import { joinRun } from "../../src/loader/join-run.js";
import { parseFile } from "../../src/loader/parse.js";
import { recognise } from "../../src/loader/recognise.js";
import type { ParsedFile } from "../../src/loader/types.js";
import { readFixture } from "../fixtures/load.js";

const reportText = readFixture("report.json");
const baseConfig = (
  JSON.parse(readFixture("history.jsonl").split("\n")[0] ?? "{}") as HistoryRecord
).config;

// A small pool of times so that equal `time` values occur often.
const time = fc
  .integer({ min: 0, max: 4 })
  .map((n) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString());

const count = fc.integer({ min: 0, max: 5 });

const record: fc.Arbitrary<HistoryRecord> = fc.record({
  time,
  gitCommit: fc.stringMatching(/^[0-9a-f]{7}$/),
  seed: fc.integer({ min: 0, max: 1000 }),
  config: fc.constant(baseConfig),
  mutants: fc.constant<HistoryRecord["mutants"]>([
    { id: "m1" as MutantId, status: "Survived" as const },
  ]),
  statusCounts: fc.record({
    Killed: count,
    Survived: count,
    Timeout: count,
    Ghost: count,
    InvalidWitness: count,
    CompileError: count,
    NotApplicable: count,
  }),
  coverageCounts: fc.record({
    guarded: count,
    unguarded: count,
    unattacked: count,
    skipped: count,
  }),
  newlyKilledIds: fc.array(fc.constantFrom("m1" as MutantId, "m2" as MutantId), { maxLength: 2 }),
});

const filler = fc.array(fc.constantFrom("", "  ", "\t"), { maxLength: 2 });

const historyText = fc
  .tuple(
    fc.array(record, { minLength: 1, maxLength: 8 }),
    fc.constantFrom("\n", "\r\n"),
    fc.array(filler, { minLength: 9, maxLength: 9 }),
  )
  .map(([records, eol, blanks]) => {
    const parts: string[] = [];
    records.forEach((r, i) => {
      for (const b of blanks[i] ?? []) parts.push(b);
      parts.push(JSON.stringify(r));
    });
    return { records, text: `${parts.join(eol)}${eol}` };
  });

describe("V9 hunt is ordered", () => {
  it("1.4, 1.12, 8.1, 8.3 history survives loading and the timeline is time-ordered", () => {
    fc.assert(
      fc.property(historyText, ({ records, text }) => {
        const files: ParsedFile[] = [];
        for (const [content, name] of [
          [reportText, "report.json"],
          [text, "history.jsonl"],
        ] as const) {
          const kind = recognise(content, name);
          if (!kind.ok) return false;
          const parsed = parseFile(kind.value, content, name);
          if (!parsed.ok) return false;
          files.push(parsed.value);
        }
        const run = joinRun(files);
        if (!run.ok) return false;

        // Stable sort by time; ISO strings of equal width compare chronologically.
        const expected = records
          .map((r, i) => ({ r, i }))
          .sort((a, b) => (a.r.time === b.r.time ? a.i - b.i : a.r.time < b.r.time ? -1 : 1))
          .map((x) => x.r);

        expect(run.value.history).toEqual(expected);

        const timeline = buildTimeline(run.value.history);
        expect(timeline).toHaveLength(expected.length);
        timeline.forEach((entry, i) => {
          const source = expected[i] as HistoryRecord;
          expect(entry.time).toBe(source.time);
          expect(entry.gitCommit).toBe(source.gitCommit);
          expect(entry.survivors).toBe(source.statusCounts.Survived);
          if (i > 0) {
            expect(Date.parse(entry.time)).toBeGreaterThanOrEqual(
              Date.parse((timeline[i - 1] as { time: string }).time),
            );
          }
        });
        return true;
      }),
    );
  });
});
