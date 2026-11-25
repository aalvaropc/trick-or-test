// Property 19: Sandbox path containment. Validates: Requirements 5.17, 5.18, 5.19
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type PlanItem,
  type ProjectEntry,
  planSandboxCopy,
  resolveInside,
} from "../../src/core/sandbox-plan.js";

const ROOT = "/tmp/sbx";
const FIXED = ["node_modules", ".git", ".trickortest", ".stryker-tmp"];

// Output directories as written by a caller, with the project-relative path they mean.
const outputDirs: ReadonlyArray<readonly [string, string]> = [
  ["reports", "reports"],
  ["./reports", "reports"],
  ["out/reports", "out/reports"],
  ["a/../out", "out"],
];

const plainSegment = fc.constantFrom("a", "b", "src", "lib", "reports", "out", "x.ts");
const anySegment = fc.oneof(
  { arbitrary: plainSegment, weight: 6 },
  { arbitrary: fc.constantFrom(...FIXED), weight: 1 },
);

/** Lexical normalisation worked out independently: undefined when absolute or leaving the base. */
const normalise = (p: string): string[] | undefined => {
  if (p.startsWith("/") || p.startsWith("\\") || /^[A-Za-z]:/.test(p)) return undefined;
  const out: string[] = [];
  for (const s of p.split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") {
      if (out.length === 0) return undefined;
      out.pop();
    } else out.push(s);
  }
  return out;
};

// Targets that stay inside the project, sometimes through `..` and `.` segments.
const insideTarget = fc
  .tuple(
    fc.array(plainSegment, { minLength: 1, maxLength: 3 }),
    fc.array(plainSegment, { maxLength: 2 }),
    fc.boolean(),
  )
  .map(([parts, detour, dot]) => {
    const wander = detour.length > 0 ? [...detour, ...detour.map(() => "..")] : [];
    return [...(dot ? ["."] : []), ...wander, ...parts].join("/");
  });

// Targets that leave the project: leading `..`, `..` that climbs past the root, or absolute.
const outsideTarget = fc.oneof(
  fc.array(plainSegment, { maxLength: 2 }).map((s) => ["..", ...s].join("/")),
  fc
    .array(plainSegment, { minLength: 1, maxLength: 2 })
    .map((s) => [...s, "..", "..", "z"].join("/")),
  fc.array(plainSegment, { minLength: 1, maxLength: 2 }).map((s) => `/etc/${s.join("/")}`),
  fc.constant(".."),
);

const entryPath = fc.array(anySegment, { minLength: 1, maxLength: 3 }).map((s) => s.join("/"));

const entry: fc.Arbitrary<ProjectEntry> = fc.oneof(
  entryPath.map((path): ProjectEntry => ({ path, kind: "file" })),
  entryPath.map((path): ProjectEntry => ({ path, kind: "dir" })),
  fc
    .tuple(entryPath, fc.oneof(insideTarget, outsideTarget))
    .map(([path, target]): ProjectEntry => ({ path, kind: "symlink", target })),
);

const listing = fc.uniqueArray(entry, { maxLength: 14, selector: (e) => e.path });
const outputDir = fc.constantFrom(...outputDirs);

const hasFixed = (path: string): boolean => path.split("/").some((s) => FIXED.includes(s));
const planned = (entries: readonly ProjectEntry[], dir: string): Map<string, PlanItem> =>
  new Map(planSandboxCopy(entries, dir).map((item) => [item.path, item]));

describe("Property 19: Sandbox path containment", () => {
  it("5.17 every path the plan copies or links resolves inside the Sandbox root", () => {
    fc.assert(
      fc.property(listing, outputDir, (entries, [raw]) => {
        for (const item of planSandboxCopy(entries, raw)) {
          if (item.action === "skip") continue;
          const dest = resolveInside(ROOT, item.path);
          expect(dest.ok).toBe(true);
          if (dest.ok) expect(dest.value.startsWith(`${ROOT}/`)).toBe(true);
        }
      }),
    );
  });

  it("5.17 resolveInside accepts exactly the paths that never leave the root, and only inside it", () => {
    const piece = fc.constantFrom("a", "b", "..", ".", "", "c.ts");
    const relative = fc.oneof(
      fc.array(piece, { maxLength: 8 }).map((p) => p.join("/")),
      fc.array(piece, { maxLength: 4 }).map((p) => `/${p.join("/")}`),
      fc.array(piece, { maxLength: 4 }).map((p) => `C:/${p.join("/")}`),
    );
    fc.assert(
      fc.property(relative, (rel) => {
        const result = resolveInside(ROOT, rel);
        const parts = normalise(rel);
        expect(result.ok).toBe(parts !== undefined);
        if (result.ok && parts !== undefined) {
          expect(result.value).toBe(parts.length === 0 ? ROOT : `${ROOT}/${parts.join("/")}`);
        }
      }),
    );
  });

  it("5.18 every symlink with a target outside the project is skipped", () => {
    fc.assert(
      fc.property(listing, outputDir, (entries, [raw]) => {
        const plan = planned(entries, raw);
        for (const e of entries) {
          if (e.kind === "symlink" && normalise(e.target ?? "") === undefined) {
            expect(plan.get(e.path)?.action).toBe("skip");
          }
        }
      }),
    );
  });

  it("5.18 every symlink with a target inside is recreated as a relative link that resolves inside the Sandbox", () => {
    fc.assert(
      fc.property(listing, outputDir, (entries, [raw, normal]) => {
        const plan = planned(entries, raw);
        for (const e of entries) {
          const target = e.kind === "symlink" ? normalise(e.target ?? "") : undefined;
          const skipped = hasFixed(e.path) || e.path === normal || e.path.startsWith(`${normal}/`);
          if (target === undefined || target.length === 0 || skipped) continue;
          const item = plan.get(e.path);
          expect(item?.action).toBe("link");
          const linkTarget = item?.linkTarget ?? "";
          expect(linkTarget.startsWith("/")).toBe(false);
          const dir = e.path.split("/").slice(0, -1).join("/");
          const resolved = resolveInside(ROOT, dir === "" ? linkTarget : `${dir}/${linkTarget}`);
          expect(resolved.ok).toBe(true);
          if (resolved.ok) expect(resolved.value).toBe(`${ROOT}/${target.join("/")}`);
        }
      }),
    );
  });

  it("5.19 only entries at the output directory path or under it are excluded by that rule", () => {
    fc.assert(
      fc.property(listing, outputDir, (entries, [raw, normal]) => {
        const plan = planned(entries, raw);
        for (const e of entries) {
          if (e.kind === "symlink" || hasFixed(e.path)) continue;
          const under = e.path === normal || e.path.startsWith(`${normal}/`);
          expect(plan.get(e.path)?.action).toBe(under ? "skip" : "copy");
        }
      }),
    );
  });

  it("5.19 a directory named like the output directory at another depth is copied", () => {
    const prefix = fc.array(fc.constantFrom("a", "b", "src", "lib"), {
      minLength: 1,
      maxLength: 2,
    });
    fc.assert(
      fc.property(prefix, fc.constantFrom("reports", "out"), (p, name) => {
        const nested = `${p.join("/")}/${name}`;
        const entries: ProjectEntry[] = [
          { path: name, kind: "dir" },
          { path: nested, kind: "dir" },
          { path: `${nested}/f.json`, kind: "file" },
        ];
        const plan = planned(entries, name);
        expect(plan.get(name)?.action).toBe("skip");
        expect(plan.get(nested)?.action).toBe("copy");
        expect(plan.get(`${nested}/f.json`)?.action).toBe("copy");
      }),
    );
  });

  it("5.19 node_modules, .git, .trickortest and .stryker-tmp are never copied", () => {
    fc.assert(
      fc.property(listing, outputDir, (entries, [raw]) => {
        const plan = planned(entries, raw);
        for (const e of entries) {
          if (hasFixed(e.path)) expect(plan.get(e.path)?.action).toBe("skip");
        }
      }),
    );
  });

  it("5.19 the plan lists every entry once, in order, with its own path", () => {
    fc.assert(
      fc.property(listing, outputDir, (entries, [raw]) => {
        expect(planSandboxCopy(entries, raw).map((i) => i.path)).toEqual(
          entries.map((e) => e.path),
        );
      }),
    );
  });
});
