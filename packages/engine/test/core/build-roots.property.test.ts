// Property 37: Build roots cover every Baseline_Run test file. Validates: Requirements 3.7, 3.22
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ProjectEntry } from "../../src/core/sandbox-plan.js";
import { buildRootsOf, computeStrykerExclusions } from "../../src/core/stryker-exclusions.js";

const plain = fc.constantFrom("src", "test", "extra", "lib", "docs");
const glob = fc
  .tuple(plain, fc.constantFrom("**/*.ts", "*.ts", "a/b.ts"))
  .map(([first, rest]) => `${first}/${rest}`);
const globs = fc.array(glob, { maxLength: 4 });
const testFile = fc.oneof(
  fc.constantFrom("root.test.ts", "other.test.ts"),
  fc.tuple(plain, fc.constantFrom("a.test.ts", "n/b.test.ts")).map(([d, f]) => `${d}/${f}`),
);
const testFiles = fc.array(testFile, { maxLength: 6 });
const wildcardGlob = fc.constantFrom(
  "**/*.test.ts",
  "*/a.ts",
  "{src,lib}/x.ts",
  "../src/x.ts",
  "s?c/x.ts",
);

const firstSegment = (p: string): string => p.split("/")[0] as string;

describe("build roots properties", () => {
  it("3.22 the roots are sorted, unique and hold every first segment", () => {
    fc.assert(
      fc.property(globs, globs, testFiles, (source, test, files) => {
        const inputs = [[...source], [...test], [...files]];
        const roots = buildRootsOf(source, test, files) as string[];
        expect(roots).toEqual([...new Set(roots)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
        for (const p of [...source, ...test, ...files]) expect(roots).toContain(firstSegment(p));
        expect([source, test, files]).toEqual(inputs);
        expect(
          buildRootsOf([...source].reverse(), [...test].reverse(), [...files].reverse()),
        ).toEqual(roots);
      }),
    );
  });

  it("3.7 no folder holding a Baseline_Run test file is in nonBuildDirs", () => {
    fc.assert(
      fc.property(globs, globs, testFiles, (source, test, files) => {
        const listing: ProjectEntry[] = ["src", "test", "extra", "lib", "docs"].map((path) => ({
          path,
          kind: "dir",
        }));
        const roots = buildRootsOf(source, test, files) as string[];
        const { nonBuildDirs } = computeStrykerExclusions(listing, roots);
        for (const f of files)
          if (f.includes("/")) expect(nonBuildDirs).not.toContain(firstSegment(f));
      }),
    );
  });

  it("3.22 a wildcard or .. first segment gives no answer", () => {
    fc.assert(
      fc.property(
        globs,
        globs,
        testFiles,
        wildcardGlob,
        fc.boolean(),
        (source, test, files, bad, inSource) => {
          const inputs = [[...source], [...test], [...files]];
          const answer = inSource
            ? buildRootsOf([...source, bad], test, files)
            : buildRootsOf(source, [...test, bad], files);
          expect(answer).toBeUndefined();
          expect([source, test, files]).toEqual(inputs);
        },
      ),
    );
  });
});
