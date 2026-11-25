import { describe, expect, it } from "vitest";
import { resolveInside } from "../../src/core/sandbox-plan.js";

describe("resolveInside", () => {
  it("5.17 resolves a nested path under the root", () => {
    expect(resolveInside("/a/b", "src/x/y.ts")).toEqual({ ok: true, value: "/a/b/src/x/y.ts" });
  });

  it("5.17 accepts a `..` that stays inside the root", () => {
    expect(resolveInside("/a/b", "src/../lib/z.ts")).toEqual({ ok: true, value: "/a/b/lib/z.ts" });
  });

  it("5.17 rejects a `..` that escapes the root", () => {
    const result = resolveInside("/a/b", "../c");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: "PathEscape", root: "/a/b", relative: "../c" });
    }
  });

  it("5.17 rejects a `..` that goes inside first and then escapes", () => {
    expect(resolveInside("/a/b", "src/../../c").ok).toBe(false);
  });

  it("5.17 rejects an absolute path", () => {
    expect(resolveInside("/a/b", "/a/b/src").ok).toBe(false);
    expect(resolveInside("/a/b", "/etc/passwd").ok).toBe(false);
  });

  it("5.17 resolves the root itself", () => {
    expect(resolveInside("/a/b", "")).toEqual({ ok: true, value: "/a/b" });
    expect(resolveInside("/a/b", ".")).toEqual({ ok: true, value: "/a/b" });
    expect(resolveInside("/a/b", "src/..")).toEqual({ ok: true, value: "/a/b" });
  });

  it("5.17 rejects a sibling directory whose name starts with the root name", () => {
    expect(resolveInside("/a/b", "../bc").ok).toBe(false);
    expect(resolveInside("/a/b", "../bc/file.ts").ok).toBe(false);
  });

  it("5.17 ignores a trailing slash on the root", () => {
    expect(resolveInside("/a/b/", "src")).toEqual({ ok: true, value: "/a/b/src" });
  });
});
