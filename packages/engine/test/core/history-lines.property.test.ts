// Property 17: History lines round trip. Validates: Requirements 8.9, 8.10, 8.16
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseHistoryLines, serializeHistoryRecord } from "../../src/core/report.js";
import type { HistoryRecord, MutantId, MutantStatus } from "../../src/core/types.js";

const STATUSES: MutantStatus[] = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
];

// Strings that stress JSON Lines: raw newlines, carriage returns, quotes, backslashes.
const nastyString = fc
  .array(
    fc.oneof(fc.string(), fc.constantFrom("\n", "\r\n", "\r", '"', "\\", "\u2028", "{", "}")),
    { maxLength: 6 },
  )
  .map((parts) => parts.join(""));

const count = fc.nat({ max: 1000 });

const mutantIdArb = nastyString.map((s) => s as MutantId);

const configArb = fc.record(
  {
    specDir: nastyString,
    sourceGlobs: fc.array(nastyString, { maxLength: 3 }),
    testGlobs: fc.array(nastyString, { maxLength: 3 }),
    propertyTestGlobs: fc.array(nastyString, { maxLength: 3 }),
    mutantsDir: nastyString,
    outputDir: nastyString,
    timeoutMs: fc.nat({ max: 100_000 }),
  },
  {
    requiredKeys: [
      "specDir",
      "sourceGlobs",
      "testGlobs",
      "propertyTestGlobs",
      "mutantsDir",
      "outputDir",
    ],
  },
);

const recordArb: fc.Arbitrary<HistoryRecord> = fc.record({
  time: nastyString,
  gitCommit: nastyString,
  seed: fc.integer(),
  config: configArb,
  mutants: fc.array(fc.record({ id: mutantIdArb, status: fc.constantFrom(...STATUSES) }), {
    maxLength: 5,
  }),
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
  newlyKilledIds: fc.array(mutantIdArb, { maxLength: 5 }),
}) as fc.Arbitrary<HistoryRecord>;

const fileText = (records: readonly HistoryRecord[]): string =>
  records.map((r) => `${serializeHistoryRecord(r)}\n`).join("");

describe("Property 17: History lines round trip", () => {
  it("8.16 serialized records parse back to the same records in the same order", () => {
    fc.assert(
      fc.property(fc.array(recordArb, { maxLength: 6 }), (records) => {
        expect(parseHistoryLines(fileText(records))).toEqual({ ok: true, value: records });
      }),
    );
  });

  it("8.10 each line is one complete JSON object", () => {
    fc.assert(
      fc.property(fc.array(recordArb, { maxLength: 6 }), (records) => {
        const text = fileText(records);
        const lines = text.split("\n");
        expect(lines.pop()).toBe("");
        expect(lines).toHaveLength(records.length);
        lines.forEach((line, i) => {
          const json: unknown = JSON.parse(line);
          expect(typeof json).toBe("object");
          expect(json).not.toBeNull();
          expect(Array.isArray(json)).toBe(false);
          expect(json).toEqual(records[i]);
        });
      }),
    );
  });

  it("8.9 appending one more line leaves earlier lines byte-identical", () => {
    fc.assert(
      fc.property(fc.array(recordArb, { maxLength: 6 }), recordArb, (records, extra) => {
        const before = fileText(records);
        const after = before + `${serializeHistoryRecord(extra)}\n`;
        expect(after.startsWith(before)).toBe(true);
        expect(after.split("\n").slice(0, records.length)).toEqual(
          before.split("\n").slice(0, records.length),
        );
        expect(parseHistoryLines(after)).toEqual({ ok: true, value: [...records, extra] });
      }),
    );
  });
});
