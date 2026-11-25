// Property 25: Changed ranges are relative and match the source globs. Validates: Requirements 3.9, 3.10
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseChangedRanges } from "../../src/core/changed-ranges.js";

const GLOBS = ["src/**/*.ts"];

type Kind = "matching" | "unmatched" | "outside";

interface Hunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
}

interface FileDiff {
  readonly kind: Kind;
  readonly path: string;
  readonly hunks: Hunk[];
}

const segment = fc.constantFrom("a", "price", "cart", "x1", "deep", "util");

const dirs = fc.array(segment, { maxLength: 3 }).map((parts) => parts.map((p) => `${p}/`).join(""));

const pathFor = (kind: Kind): fc.Arbitrary<string> => {
  switch (kind) {
    case "matching":
      return fc.tuple(dirs, segment).map(([dir, name]) => `src/${dir}${name}.ts`);
    case "unmatched":
      return fc.oneof(
        fc.tuple(dirs, segment).map(([dir, name]) => `test/${dir}${name}.ts`),
        fc.tuple(dirs, segment).map(([dir, name]) => `src/${dir}${name}.js`),
        segment.map((name) => `${name}.ts`),
      );
    case "outside":
      return fc.oneof(
        fc.tuple(dirs, segment).map(([dir, name]) => `../other/src/${dir}${name}.ts`),
        fc.tuple(dirs, segment).map(([dir, name]) => `src/../../${dir}${name}.ts`),
        fc.tuple(dirs, segment).map(([dir, name]) => `/abs/src/${dir}${name}.ts`),
      );
  }
};

// Counts 0, 1 and many are all reached on purpose; a count of 1 may be written without a count.
const hunkArb: fc.Arbitrary<Hunk> = fc.record({
  oldStart: fc.integer({ min: 0, max: 500 }),
  oldCount: fc.constantFrom(0, 1, 2, 7),
  newStart: fc.integer({ min: 1, max: 500 }),
  newCount: fc.oneof(fc.constantFrom(0, 1, 2), fc.integer({ min: 0, max: 40 })),
});

const fileArb: fc.Arbitrary<FileDiff> = fc
  .constantFrom<Kind>("matching", "unmatched", "outside")
  .chain((kind) =>
    fc.record({
      kind: fc.constant(kind),
      path: pathFor(kind),
      hunks: fc.array(hunkArb, { minLength: 1, maxLength: 4 }),
    }),
  );

const diffArb = fc.uniqueArray(fileArb, {
  maxLength: 6,
  selector: (file) => file.path,
});

const header = (hunk: Hunk): string => {
  const old = hunk.oldCount === 1 ? `${hunk.oldStart}` : `${hunk.oldStart},${hunk.oldCount}`;
  const next = hunk.newCount === 1 ? `${hunk.newStart}` : `${hunk.newStart},${hunk.newCount}`;
  return `@@ -${old} +${next} @@`;
};

const render = (files: FileDiff[]): string =>
  files
    .map((file) =>
      [
        `diff --git a/${file.path} b/${file.path}`,
        "index 1111111..2222222 100644",
        `--- a/${file.path}`,
        `+++ b/${file.path}`,
        ...file.hunks.flatMap((hunk) => [header(hunk), "-old", "+new"]),
        "",
      ].join("\n"),
    )
    .join("");

const matchesSourceGlob = (file: string): boolean =>
  file.startsWith("src/") && file.endsWith(".ts");

describe("changed-ranges property", () => {
  it("3.9 every range is project-relative, matches a source glob and has start <= end", () => {
    fc.assert(
      fc.property(diffArb, (files) => {
        for (const range of parseChangedRanges(render(files), GLOBS)) {
          expect(range.file.startsWith("/")).toBe(false);
          expect(range.file.split("/")).not.toContain("..");
          expect(matchesSourceGlob(range.file)).toBe(true);
          expect(range.start).toBeLessThanOrEqual(range.end);
        }
      }),
    );
  });

  it("3.9 ranges are sorted by file and then by start line", () => {
    fc.assert(
      fc.property(diffArb, (files) => {
        const ranges = parseChangedRanges(render(files), GLOBS);
        for (let i = 1; i < ranges.length; i++) {
          const prev = ranges[i - 1];
          const cur = ranges[i];
          if (prev === undefined || cur === undefined) throw new Error("unreachable");
          expect(prev.file <= cur.file).toBe(true);
          if (prev.file === cur.file) expect(prev.start).toBeLessThanOrEqual(cur.start);
        }
      }),
    );
  });

  it("3.9 the result holds one range per added hunk of a matching file and none for a pure deletion", () => {
    fc.assert(
      fc.property(diffArb, (files) => {
        const expected = files
          .filter((file) => file.kind === "matching")
          .flatMap((file) =>
            file.hunks
              .filter((hunk) => hunk.newCount > 0)
              .map((hunk) => ({
                file: file.path,
                start: hunk.newStart,
                end: hunk.newStart + hunk.newCount - 1,
              })),
          );
        const actual = parseChangedRanges(render(files), GLOBS);
        const key = (r: { file: string; start: number; end: number }): string =>
          `${r.file}:${r.start}-${r.end}`;
        expect(actual.map(key).sort()).toEqual(expected.map(key).sort());
      }),
    );
  });

  it("3.10 files outside the source globs or outside the project directory never produce a range", () => {
    fc.assert(
      fc.property(diffArb, (files) => {
        const foreign = files.filter((file) => file.kind !== "matching");
        const globs = ["**/*.ts", "../**/*.ts", "/abs/**/*.ts", "src/**/*.js"];
        const ranges = parseChangedRanges(render(foreign), globs);
        const insideAndMatching = foreign.filter(
          (file) =>
            file.kind === "unmatched" && (file.path.endsWith(".ts") || file.path.endsWith(".js")),
        );
        const allowed = new Set(insideAndMatching.map((file) => file.path));
        for (const range of ranges) expect(allowed.has(range.file)).toBe(true);
        expect(
          ranges.some((range) => range.file.startsWith("/") || range.file.includes("..")),
        ).toBe(false);
      }),
    );
  });

  it("3.9 the result is empty exactly when no added line falls in a matching file", () => {
    fc.assert(
      fc.property(diffArb, (files) => {
        const hasAdded = files.some(
          (file) => file.kind === "matching" && file.hunks.some((hunk) => hunk.newCount > 0),
        );
        expect(parseChangedRanges(render(files), GLOBS).length === 0).toBe(!hasAdded);
      }),
    );
  });
});
