import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildHistoryRecord,
  buildVerdict,
  historyRecordSchema,
  runMetadataSchema,
  type VerdictInput,
  verdictSchema,
} from "../../src/core/report.js";
import type { EngineConfig } from "../../src/core/types.js";

const root = "/work/project";

const metadata = {
  gitCommit: "abc123",
  seed: 0,
  engineVersion: "0.0.0",
  nodeVersion: "v26.0.0",
  strykerVersion: "1.0.0",
  vitestVersion: "1.0.0",
  typescriptVersion: "7.0.0",
  timestamp: "2025-01-01T00:00:00.000Z",
};

const config: EngineConfig = {
  specDir: "/work/project/.kiro/specs/cart",
  sourceGlobs: ["src/**/*.ts"],
  testGlobs: ["test/**/*.test.ts"],
  propertyTestGlobs: ["test/**/*.property.test.ts"],
  mutantsDir: "/work/project/mutants/cart",
  outputDir: "/work/project/.trickortest",
};

const verdictInput: VerdictInput = {
  coverage: [],
  mutants: [],
  witnesses: {},
  ignoreStaticRetried: false,
  metadata,
  projectRoot: root,
};

type JsonSchemaNode = { properties?: Record<string, { description?: string }> };

const seedDescription = (schema: z.ZodType): string | undefined => {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchemaNode;
  return json.properties?.["seed"]?.description;
};

const verdictSeedDescription = (): string | undefined => {
  const json = z.toJSONSchema(verdictSchema, { io: "input", unrepresentable: "any" }) as {
    properties?: Record<string, JsonSchemaNode>;
  };
  return json.properties?.["metadata"]?.properties?.["seed"]?.description;
};

const builtVerdict = () => {
  const r = buildVerdict(structuredClone(verdictInput));
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("seed description", () => {
  it("8.6 the seed of the run metadata schema carries a description", () => {
    expect(typeof seedDescription(runMetadataSchema)).toBe("string");
    expect(seedDescription(runMetadataSchema)?.length).toBeGreaterThan(0);
  });

  it("8.6 the seed of the verdict schema carries a description through its metadata", () => {
    expect(verdictSeedDescription()).toBe(seedDescription(runMetadataSchema));
  });

  it("8.9 the seed of the history-record schema carries a description", () => {
    expect(typeof seedDescription(historyRecordSchema)).toBe("string");
    expect(seedDescription(historyRecordSchema)?.length).toBeGreaterThan(0);
  });

  it("8.9 the verdict and history descriptions are equal", () => {
    expect(seedDescription(historyRecordSchema)).toBe(verdictSeedDescription());
  });

  it("8.6 the text names the engine", () => {
    expect(verdictSeedDescription()).toMatch(/engine/i);
  });

  it("8.6 the text says the value is 0 today", () => {
    expect(verdictSeedDescription()).toMatch(/always 0 today/);
  });

  it("8.6 the text says it is not the seed of the property tests of the project", () => {
    expect(verdictSeedDescription()).toMatch(/not the seed of the property tests of the/);
  });

  it("8.6 a verdict with seed 0 still parses", () => {
    expect(verdictSchema.safeParse(builtVerdict()).success).toBe(true);
  });

  it("8.9 a history record with seed 0 still parses", () => {
    const r = buildHistoryRecord(builtVerdict(), undefined, config, root);
    if (!r.ok) throw new Error(r.error);
    expect(historyRecordSchema.safeParse(r.value).success).toBe(true);
  });

  it("8.6 buildVerdict still writes seed 0", () => {
    expect(builtVerdict().metadata.seed).toBe(0);
  });

  it("8.9 buildHistoryRecord still writes seed 0", () => {
    const r = buildHistoryRecord(builtVerdict(), undefined, config, root);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.seed).toBe(0);
  });
});
