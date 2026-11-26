import { describe, expect, it } from "vitest";
import { dropTwins, type ReportableMutant } from "../../src/core/twins.js";

type M = ReportableMutant & { id: string };

const base = {
  file: "src/a.ts",
  location: { start: { line: 3, column: 5 }, end: { line: 3, column: 9 } },
  replacement: "a > b",
};
const spec = (over: Partial<M> = {}): M => ({ id: "oath-1.1-x", kind: "spec", ...base, ...over });
const mech = (over: Partial<M> = {}): M => ({ id: "m1", kind: "mechanical", ...base, ...over });

describe("dropTwins", () => {
  it("8.15 a Twin is dropped and its Spec_Mutant kept", () => {
    const { kept, twinsMerged } = dropTwins([mech(), spec()]);
    expect(kept).toEqual([spec()]);
    expect(twinsMerged).toBe(1);
  });

  it.each([
    ["start line", { location: { ...base.location, start: { line: 4, column: 5 } } }],
    ["start column", { location: { ...base.location, start: { line: 3, column: 6 } } }],
    ["end line", { location: { ...base.location, end: { line: 4, column: 9 } } }],
    ["end column", { location: { ...base.location, end: { line: 3, column: 10 } } }],
    ["file", { file: "src/b.ts" }],
    ["replacement", { replacement: "a < b" }],
  ] as [string, Partial<M>][])(
    "8.15 a Mechanical_Mutant that differs only in %s is kept",
    (_n, over) => {
      const list = [mech(over), spec()];
      const { kept, twinsMerged } = dropTwins(list);
      expect(kept).toEqual(list);
      expect(twinsMerged).toBe(0);
    },
  );

  it("8.15 a list without Twins comes back unchanged and in order", () => {
    const list = [mech({ id: "m2", replacement: "x" }), spec(), mech({ id: "m3", file: "z.ts" })];
    const once = dropTwins(list);
    expect(once.kept).toEqual(list);
    expect(dropTwins(once.kept)).toEqual({ kept: list, twinsMerged: 0 });
  });

  it("8.15 twinsMerged equals the number dropped", () => {
    const list = [mech({ id: "a" }), mech({ id: "b" }), mech({ id: "c", file: "q.ts" }), spec()];
    const { kept, twinsMerged } = dropTwins(list);
    expect(twinsMerged).toBe(2);
    expect(kept).toHaveLength(list.length - twinsMerged);
  });

  it("8.15 ids play no part in the comparison", () => {
    expect(dropTwins([mech({ id: "same" }), spec({ id: "same" })]).twinsMerged).toBe(1);
    expect(dropTwins([mech({ id: "a", replacement: "x" }), spec({ id: "a" })]).twinsMerged).toBe(0);
  });
});
