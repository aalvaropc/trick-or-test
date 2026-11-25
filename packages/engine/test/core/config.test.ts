import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfigPaths, validateConfig } from "../../src/core/config.js";

const FILE = "trickortest.config.json";

describe("validateConfig", () => {
  it("1.1 parses every field of the file", () => {
    const raw = {
      specDir: "specs",
      sourceGlobs: ["lib/**/*.ts"],
      testGlobs: ["t/**/*.test.ts"],
      propertyTestGlobs: ["t/**/*.prop.test.ts"],
      mutantsDir: "m",
      outputDir: "out",
      timeoutMs: 9000,
    };
    expect(validateConfig(JSON.stringify(raw))).toEqual({ ok: true, value: raw });
  });

  it.each(Object.keys(DEFAULT_CONFIG) as (keyof typeof DEFAULT_CONFIG)[])(
    "1.2 uses the default when only %s is absent",
    (field) => {
      const full = {
        specDir: "a",
        sourceGlobs: ["b"],
        testGlobs: ["c"],
        propertyTestGlobs: ["d"],
        mutantsDir: "e",
        outputDir: "f",
      };
      const { [field]: _omitted, ...partial } = full;
      const result = validateConfig(partial);
      expect(result).toEqual({ ok: true, value: { ...full, [field]: DEFAULT_CONFIG[field] } });
    },
  );

  it("1.3 returns only defaults when the file is absent", () => {
    const result = validateConfig(undefined);
    expect(result).toEqual({ ok: true, value: DEFAULT_CONFIG });
    expect(result.ok && "timeoutMs" in result.value).toBe(false);
  });

  it("1.4 names the file when the content is not valid JSON", () => {
    const result = validateConfig("{ not json");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.filePath).toBe(FILE);
  });

  it("1.5 names the file and the field when a field has the wrong type", () => {
    const result = validateConfig({ specDir: 42 });
    expect(result).toMatchObject({ ok: false, error: { filePath: FILE, field: "specDir" } });
  });

  it("1.5 names the file and the field for a wrong element type inside a list", () => {
    const result = validateConfig({ sourceGlobs: ["ok", 1] });
    expect(result).toMatchObject({ ok: false, error: { filePath: FILE, field: "sourceGlobs.1" } });
  });

  it("1.5 names the file and the field when a field is unknown", () => {
    const result = validateConfig({ specDirectory: "x" });
    expect(result).toMatchObject({ ok: false, error: { filePath: FILE, field: "specDirectory" } });
  });

  it("1.7 leaves timeoutMs unset when absent", () => {
    const result = validateConfig({ specDir: "s" });
    expect(result.ok && "timeoutMs" in result.value).toBe(false);
  });

  it("1.1 keeps timeoutMs when present", () => {
    const result = validateConfig({ timeoutMs: 1234 });
    expect(result.ok && result.value.timeoutMs).toBe(1234);
  });

  it("1.5 rejects a timeoutMs of the wrong type", () => {
    const result = validateConfig({ timeoutMs: "fast" });
    expect(result).toMatchObject({ ok: false, error: { filePath: FILE, field: "timeoutMs" } });
  });
});

describe("resolveConfigPaths", () => {
  it("1.6 resolves every path against the project root", () => {
    const resolved = resolveConfigPaths(
      {
        specDir: ".kiro/specs",
        sourceGlobs: ["src/**/*.ts", "./lib/*.ts"],
        testGlobs: ["test/**/*.test.ts"],
        propertyTestGlobs: ["test/**/*.property.test.ts"],
        mutantsDir: "mutants",
        outputDir: "reports",
      },
      "/proj/",
    );
    expect(resolved).toEqual({
      specDir: "/proj/.kiro/specs",
      sourceGlobs: ["/proj/src/**/*.ts", "/proj/lib/*.ts"],
      testGlobs: ["/proj/test/**/*.test.ts"],
      propertyTestGlobs: ["/proj/test/**/*.property.test.ts"],
      mutantsDir: "/proj/mutants",
      outputDir: "/proj/reports",
    });
  });

  it("1.6 keeps timeoutMs unset or unchanged while resolving", () => {
    const base = { ...DEFAULT_CONFIG, sourceGlobs: [...DEFAULT_CONFIG.sourceGlobs] };
    expect("timeoutMs" in resolveConfigPaths(base, "/p")).toBe(false);
    expect(resolveConfigPaths({ ...base, timeoutMs: 5 }, "/p").timeoutMs).toBe(5);
  });
});
