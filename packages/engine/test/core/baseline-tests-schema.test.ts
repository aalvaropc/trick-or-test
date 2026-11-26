import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { baselineTestSchema, verdictSchema } from "../../src/core/report.js";
import * as reportSubpath from "../../src/report/index.js";

const metadata = {
  gitCommit: "abc123",
  seed: 1,
  engineVersion: "0.0.0",
  nodeVersion: "v26.0.0",
  strykerVersion: "1.0.0",
  vitestVersion: "1.0.0",
  typescriptVersion: "7.0.0",
  timestamp: "2025-01-01T00:00:00.000Z",
};

const baseVerdict = (): Record<string, unknown> => ({
  coverage: [],
  mutants: [],
  witnesses: {},
  ignoreStaticRetried: false,
  metadata,
});

const entry = (): Record<string, unknown> => ({
  id: "test/cart.test.ts::4.1 standard shipping is free",
  kind: "example",
});

describe("baselineTests schema", () => {
  it("8.29 a verdict without baselineTests parses", () => {
    expect(verdictSchema.safeParse(baseVerdict()).success).toBe(true);
  });

  it("6.11 an empty baselineTests list parses", () => {
    const parsed = verdictSchema.safeParse({ ...baseVerdict(), baselineTests: [] });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.baselineTests).toEqual([]);
    }
  });

  it("6.11 entries of kind example and property parse and are kept", () => {
    const parsed = verdictSchema.safeParse({
      ...baseVerdict(),
      baselineTests: [entry(), { id: "test/a.property.test.ts::p", kind: "property" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.baselineTests?.map((t) => t.kind)).toEqual(["example", "property"]);
    }
  });

  it("6.11 an entry with a kind other than property and example is rejected", () => {
    expect(
      verdictSchema.safeParse({
        ...baseVerdict(),
        baselineTests: [{ ...entry(), kind: "snapshot" }],
      }).success,
    ).toBe(false);
  });

  it("6.11 an unknown key in an entry is rejected", () => {
    expect(
      verdictSchema.safeParse({
        ...baseVerdict(),
        baselineTests: [{ ...entry(), extra: 1 }],
      }).success,
    ).toBe(false);
  });

  it("6.11 an entry without an id is rejected", () => {
    expect(baselineTestSchema.safeParse({ kind: "example" }).success).toBe(false);
  });

  it("6.11 the report subpath exports the schema", () => {
    expect(reportSubpath.baselineTestSchema).toBe(baselineTestSchema);
  });

  it("10.4 the report subpath index has no node: import", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "../../src/report/index.ts"), "utf8");
    expect(source).not.toMatch(/["']node:/);
  });
});
