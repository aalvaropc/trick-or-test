import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Typecheck } from "../../src/adapters/typecheck-adapter.js";

const fixture = (name: string): string => join(import.meta.dirname, "..", "fixtures", name);

describe("Typecheck.run", () => {
  it("5.3 returns ok for a project that type-checks", async () => {
    const result = await Typecheck.run(fixture("typecheck-ok"));
    expect(result.ok).toBe(true);
  });

  it("5.3 returns a CompileError carrying the first error line for a type error", async () => {
    const result = await Typecheck.run(fixture("typecheck-error"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("CompileError");
    expect(result.error.firstError).toContain("src/index.ts");
    expect(result.error.firstError).toMatch(/error TS2322/);
    expect(result.error.firstError).not.toContain("\n");
  });

  it("5.3 returns a CompileError when typescript cannot be found", async () => {
    const dir = mkdtempSync(join(tmpdir(), "typecheck-none-"));
    try {
      const result = await Typecheck.run(dir);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.firstError).toContain("Cannot find typescript");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
