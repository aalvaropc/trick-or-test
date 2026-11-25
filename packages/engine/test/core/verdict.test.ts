import { describe, expect, it } from "vitest";
import { buildVerdict, serializeVerdict, type VerdictInput } from "../../src/core/report.js";
import type { CriterionId, MutantId, TestId, Verdict } from "../../src/core/types.js";

const mid = (s: string) => s as MutantId;
const cid = (s: string) => s as CriterionId;
const tid = (s: string) => s as TestId;

const base = (): VerdictInput => ({
  coverage: [
    { criterion: cid("1.1"), status: "guarded" },
    { criterion: cid("1.2"), status: "skipped", reason: "not testable" },
  ],
  mutants: [
    {
      id: mid("oath-1.1"),
      species: "Oathbreaker",
      status: "Killed",
      requirement: cid("1.1"),
      killingTests: [tid("a")],
      killClass: "both",
    },
    {
      id: mid("oath-1.3"),
      species: "Oathbreaker",
      status: "Survived",
      requirement: cid("1.3"),
      killingTests: [],
    },
  ],
  witnesses: {
    [mid("oath-1.1")]: { from: "src/a.ts", export: "f", args: [1], expected: 2 },
  },
  ignoreStaticRetried: false,
  metadata: {
    gitCommit: "abc123",
    seed: 42,
    engineVersion: "0.1.0",
    nodeVersion: "22.0.0",
    strykerVersion: "9.0.0",
    vitestVersion: "3.0.0",
    typescriptVersion: "5.6.0",
    timestamp: "2025-01-01T00:00:00.000Z",
  },
});

describe("buildVerdict", () => {
  it("8.5 includes coverage, mutants, witnesses, retry flag and metadata", () => {
    const r = buildVerdict(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.value).sort()).toEqual([
      "coverage",
      "ignoreStaticRetried",
      "metadata",
      "mutants",
      "witnesses",
    ]);
    expect(r.value.coverage).toHaveLength(2);
    expect(r.value.mutants.map((m) => m.status)).toEqual(["Killed", "Survived"]);
    expect(r.value.witnesses[mid("oath-1.1")]).toBeDefined();
    expect(Object.keys(r.value.metadata).sort()).toEqual([
      "engineVersion",
      "gitCommit",
      "nodeVersion",
      "seed",
      "strykerVersion",
      "timestamp",
      "typescriptVersion",
      "vitestVersion",
    ]);
  });

  it("8.5 keeps the kill class only on Killed mutants", () => {
    const input = base();
    input.mutants[1] = { ...input.mutants[1]!, killClass: "both" };
    const r = buildVerdict(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mutants[0]?.killClass).toBe("both");
    expect(r.value.mutants[1]).not.toHaveProperty("killClass");
  });

  it("8.5 marks a Killed mutant without a kill class as unattributed", () => {
    const input = base();
    const { killClass: _k, ...killed } = input.mutants[0]!;
    input.mutants[0] = killed;
    const r = buildVerdict(input);
    expect(r.ok && r.value.mutants[0]?.killClass).toBe("unattributed");
  });

  it("8.6 records whether the ignoreStatic retry happened", () => {
    for (const flag of [true, false]) {
      const r = buildVerdict({ ...base(), ignoreStaticRetried: flag });
      expect(r.ok && r.value.ignoreStaticRetried).toBe(flag);
    }
  });

  it("8.10 returns an error when the verdict fails the schema", () => {
    const input = base();
    input.metadata = { ...input.metadata, seed: 1.5 };
    const r = buildVerdict(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("metadata.seed");
  });

  it("8.13 gives the same output for the same input except metadata.timestamp", () => {
    const a = buildVerdict(base());
    const b = buildVerdict(base());
    const c = buildVerdict({
      ...base(),
      metadata: { ...base().metadata, timestamp: "2030-01-01T00:00:00.000Z" },
    });
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    if (!a.ok || !c.ok) throw new Error("expected ok");
    const strip = (v: typeof a.value) => ({ ...v, metadata: { ...v.metadata, timestamp: "" } });
    expect(strip(a.value)).toEqual(strip(c.value));
  });
});

describe("serializeVerdict", () => {
  it("8.12 gives identical text for the same verdict built with keys in a different order", () => {
    const r = buildVerdict(base());
    if (!r.ok) throw new Error("expected ok");
    const v = r.value;
    const reverse = <T extends object>(o: T): T =>
      Object.fromEntries(Object.entries(o).reverse()) as T;
    const reordered: Verdict = {
      metadata: reverse(v.metadata),
      ignoreStaticRetried: v.ignoreStaticRetried,
      witnesses: Object.fromEntries(
        Object.entries(v.witnesses).map(([k, w]) => [k, reverse(w)]),
      ) as Verdict["witnesses"],
      mutants: v.mutants.map(reverse),
      coverage: v.coverage.map(reverse),
    };
    expect(Object.keys(reordered)).not.toEqual(Object.keys(v));
    expect(Object.keys(reordered.metadata)).not.toEqual(Object.keys(v.metadata));
    const text = serializeVerdict(v);
    expect(serializeVerdict(reordered)).toBe(text);
    expect(text.startsWith('{\n  "coverage": [')).toBe(true);
    expect(text.endsWith("}\n")).toBe(true);
  });
});
