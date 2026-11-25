// Property 24: Stryker exclusion list. Validates: Requirements 3.7, 3.8
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ProjectEntry } from "../../src/core/sandbox-plan.js";
import { computeStrykerExclusions } from "../../src/core/stryker-exclusions.js";

// A small pool so that build roots, listed directories and nested directories collide often.
const TOP_NAMES = ["src", "test", "docs", "scripts", "lib", ".stryker-tmp", ".trickortest"];
const ROOT_NAMES = [...TOP_NAMES, "missing"];
const INNER_NAMES = ["deep", "shared"];
// Link names start with "dl" (link to a directory) or "fl" (link to a file) so the expectation
// knows which kind it is without looking at the target.
const LINK_PARENTS = ["", "src/", "docs/", "lib/deep/"];
const FILE_NAMES = ["package.json", "src/index.ts", "docs/readme.md", "shared"];

const topName = fc.constantFrom(...TOP_NAMES);

type Group = ProjectEntry[];

const groupArb: fc.Arbitrary<Group> = fc.oneof(
  topName.map((n): Group => [{ path: n, kind: "dir" }]),
  fc
    .tuple(topName, fc.constantFrom(...INNER_NAMES))
    .map(([t, i]): Group => [{ path: `${t}/${i}`, kind: "dir" }]),
  fc.constantFrom(...FILE_NAMES).map((f): Group => [{ path: f, kind: "file" }]),
  fc.tuple(fc.constantFrom(...LINK_PARENTS), fc.nat({ max: 2 }), topName).map(
    ([parent, n, target]): Group => [
      { path: target, kind: "dir" },
      { path: `${parent}dl${n}`, kind: "symlink", target },
    ],
  ),
  fc
    .tuple(fc.constantFrom(...LINK_PARENTS), fc.nat({ max: 2 }), fc.constantFrom(...FILE_NAMES))
    .map(
      ([parent, n, target]): Group => [
        { path: target, kind: "file" },
        { path: `${parent}fl${n}`, kind: "symlink", target },
      ],
    ),
);

// Concatenated groups, then a prefix repeated to force duplicated entries.
const listingArb: fc.Arbitrary<ProjectEntry[]> = fc
  .tuple(fc.array(groupArb, { maxLength: 12 }), fc.nat({ max: 6 }))
  .map(([groups, dup]) => {
    const flat = groups.flat();
    return [...flat, ...flat.slice(0, dup)];
  });

const rootsArb = fc.subarray(ROOT_NAMES);
const outputDirArb = fc.option(fc.constantFrom("reports", "out/build", "./reports/"), {
  nil: undefined,
});

const baseName = (p: string): string => p.slice(p.lastIndexOf("/") + 1);

const shuffledListing = listingArb.chain((listing) =>
  fc.tuple(
    fc.constant(listing),
    fc.shuffledSubarray(listing, { minLength: listing.length, maxLength: listing.length }),
  ),
);

describe("Property 24: Stryker exclusion list", () => {
  it("3.7 every top-level directory that is not a build root is listed, and nothing else", () => {
    fc.assert(
      fc.property(listingArb, rootsArb, (listing, roots) => {
        const { nonBuildDirs } = computeStrykerExclusions(listing, roots);
        for (const entry of listing) {
          const topLevelDir = entry.kind === "dir" && !entry.path.includes("/");
          if (topLevelDir && !roots.includes(entry.path)) {
            expect(nonBuildDirs).toContain(entry.path);
          }
        }
        for (const listed of nonBuildDirs) {
          expect(listing).toContainEqual({ path: listed, kind: "dir" });
          expect(listed).not.toContain("/");
          expect(roots).not.toContain(listed);
        }
      }),
    );
  });

  it("3.7 a build root is never listed in nonBuildDirs nor as a plain ignore pattern", () => {
    fc.assert(
      fc.property(listingArb, rootsArb, outputDirArb, (listing, roots, outputDir) => {
        const result = computeStrykerExclusions(listing, roots, outputDir);
        for (const root of roots) {
          expect(result.nonBuildDirs).not.toContain(root);
          const isAlwaysIgnored = root === ".stryker-tmp" || root === ".trickortest";
          const isOutput = outputDir !== undefined && root === outputDir.replace(/^\.\/|\/$/g, "");
          if (!isAlwaysIgnored && !isOutput) {
            expect(result.ignorePatterns).not.toContain(`${root}/**`);
          }
        }
      }),
    );
  });

  it("3.7 a nested directory is never listed in nonBuildDirs", () => {
    fc.assert(
      fc.property(listingArb, rootsArb, (listing, roots) => {
        const { nonBuildDirs } = computeStrykerExclusions(listing, roots);
        expect(nonBuildDirs.filter((d) => d.includes("/"))).toEqual([]);
      }),
    );
  });

  it("3.8 every symlink to a directory is listed and no symlink to a file is", () => {
    fc.assert(
      fc.property(listingArb, rootsArb, (listing, roots) => {
        const { symlinkedDirs } = computeStrykerExclusions(listing, roots);
        const links = listing.filter((e) => e.kind === "symlink");
        for (const link of links) {
          if (baseName(link.path).startsWith("dl")) {
            expect(symlinkedDirs).toContain(link.path);
          } else {
            expect(symlinkedDirs).not.toContain(link.path);
          }
        }
        for (const listed of symlinkedDirs) {
          expect(links.map((l) => l.path)).toContain(listed);
        }
      }),
    );
  });

  it("3.7 ignorePatterns always include .stryker-tmp and .trickortest", () => {
    fc.assert(
      fc.property(listingArb, rootsArb, outputDirArb, (listing, roots, outputDir) => {
        const { ignorePatterns } = computeStrykerExclusions(listing, roots, outputDir);
        expect(ignorePatterns).toContain(".stryker-tmp/**");
        expect(ignorePatterns).toContain(".trickortest/**");
      }),
    );
  });

  it("3.8 ignorePatterns cover every listed directory and the output directory", () => {
    fc.assert(
      fc.property(listingArb, rootsArb, (listing, roots) => {
        const result = computeStrykerExclusions(listing, roots, "reports");
        for (const d of [...result.nonBuildDirs, ...result.symlinkedDirs, "reports"]) {
          expect(result.ignorePatterns).toContain(`${d}/**`);
        }
        for (const pattern of result.ignorePatterns) {
          expect(pattern.endsWith("/**")).toBe(true);
        }
      }),
    );
  });

  it("3.7 outputs are strictly ascending, so sorted and without duplicates", () => {
    fc.assert(
      fc.property(listingArb, rootsArb, outputDirArb, (listing, roots, outputDir) => {
        const result = computeStrykerExclusions(listing, roots, outputDir);
        for (const list of [result.nonBuildDirs, result.symlinkedDirs, result.ignorePatterns]) {
          for (let i = 1; i < list.length; i++) {
            expect((list[i - 1] as string) < (list[i] as string)).toBe(true);
          }
        }
      }),
    );
  });

  it("3.7 the same listing in any order gives the same output", () => {
    fc.assert(
      fc.property(shuffledListing, rootsArb, outputDirArb, ([listing, shuffled], roots, out) => {
        expect(computeStrykerExclusions(shuffled, roots, out)).toEqual(
          computeStrykerExclusions(listing, roots, out),
        );
      }),
    );
  });
});
