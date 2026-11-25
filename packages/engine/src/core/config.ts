import { z } from "zod";
import { err, ok, type Result } from "./result.js";
import type { EngineConfig } from "./types.js";

export const CONFIG_FILE_NAME = "trickortest.config.json";

export type ConfigError = {
  filePath: string;
  field?: string;
  message: string;
};

export const DEFAULT_CONFIG: Readonly<Omit<EngineConfig, "timeoutMs">> = {
  specDir: ".kiro/specs",
  sourceGlobs: ["src/**/*.ts"],
  testGlobs: ["test/**/*.test.ts"],
  propertyTestGlobs: ["test/**/*.property.test.ts"],
  mutantsDir: "mutants",
  outputDir: "reports",
};

const configSchema = z.strictObject({
  specDir: z.string().default(DEFAULT_CONFIG.specDir),
  sourceGlobs: z.array(z.string()).default([...DEFAULT_CONFIG.sourceGlobs]),
  testGlobs: z.array(z.string()).default([...DEFAULT_CONFIG.testGlobs]),
  propertyTestGlobs: z.array(z.string()).default([...DEFAULT_CONFIG.propertyTestGlobs]),
  mutantsDir: z.string().default(DEFAULT_CONFIG.mutantsDir),
  outputDir: z.string().default(DEFAULT_CONFIG.outputDir),
  timeoutMs: z.number().int().nonnegative().optional(),
});

const fail = (message: string, field?: string): Result<never, ConfigError> =>
  err(
    field === undefined
      ? { filePath: CONFIG_FILE_NAME, message }
      : { filePath: CONFIG_FILE_NAME, field, message },
  );

/**
 * Validates the content of `trickortest.config.json`.
 * - `undefined`: the file is absent, so every default applies (Requirement 1.3).
 * - `string`: the raw file text, parsed here as JSON (Requirement 1.4).
 * - anything else: an already parsed JSON value.
 * `timeoutMs` stays unset when absent (Requirement 1.7).
 */
export function validateConfig(raw: unknown): Result<EngineConfig, ConfigError> {
  let value: unknown = raw === undefined ? {} : raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return fail("is not valid JSON");
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail("must contain a JSON object");
  }

  const parsed = configSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue === undefined) return fail("is invalid");
    if (issue.code === "unrecognized_keys") {
      const key = issue.keys[0];
      return fail(`has an unknown field "${key}"`, key);
    }
    const field = issue.path.length > 0 ? issue.path.join(".") : undefined;
    return fail(
      field === undefined
        ? `is invalid: ${issue.message}`
        : `has an invalid field "${field}": ${issue.message}`,
      field,
    );
  }

  const { timeoutMs, ...rest } = parsed.data;
  return ok(timeoutMs === undefined ? rest : { ...rest, timeoutMs });
}

const joinPath = (root: string, path: string): string => {
  if (path.startsWith("/")) return path;
  const base = root.length > 1 ? root.replace(/\/+$/, "") : root;
  const rel = path.replace(/^(\.\/)+/, "");
  return base === "" || base === "." ? rel : `${base}/${rel}`;
};

/** Resolves every path of the configuration against the Target_Project root (Requirement 1.6). */
export function resolveConfigPaths(config: EngineConfig, projectRoot: string): EngineConfig {
  const resolved: EngineConfig = {
    specDir: joinPath(projectRoot, config.specDir),
    sourceGlobs: config.sourceGlobs.map((g) => joinPath(projectRoot, g)),
    testGlobs: config.testGlobs.map((g) => joinPath(projectRoot, g)),
    propertyTestGlobs: config.propertyTestGlobs.map((g) => joinPath(projectRoot, g)),
    mutantsDir: joinPath(projectRoot, config.mutantsDir),
    outputDir: joinPath(projectRoot, config.outputDir),
  };
  return config.timeoutMs === undefined ? resolved : { ...resolved, timeoutMs: config.timeoutMs };
}
