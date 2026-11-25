import { z } from "zod";
import { relativizePath, scrubAbsolutePaths } from "./paths.js";
import { err, ok, type Result } from "./result.js";
import type {
  CoverageStatus,
  CriterionCoverage,
  CriterionId,
  EngineConfig,
  HistoryRecord,
  InvalidWitnessRecord,
  MutantId,
  MutantResult,
  MutantStatus,
  RunMetadata,
  Species,
  TestId,
  Verdict,
  Witness,
} from "./types.js";
import type { WitnessOutcome } from "./witness-compare.js";

// ---------------------------------------------------------------------------
// Zod schemas (Requirement 8.10 validates the Verdict and history records with these).
// ---------------------------------------------------------------------------

const mutantIdSchema = z.custom<MutantId>((v) => typeof v === "string");
const criterionIdSchema = z.custom<CriterionId>((v) => typeof v === "string");
const testIdSchema = z.custom<TestId>((v) => typeof v === "string");

export const mutantStatusSchema = z.enum([
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
]);
export const speciesSchema = z.enum([
  "Borderling",
  "Miscount",
  "Two-Face",
  "Hollow",
  "Impostor",
  "Oathbreaker",
  "Unclassified",
]);
export const killClassSchema = z.enum(["examples-only", "properties-only", "both", "unattributed"]);
export const coverageStatusSchema = z.enum(["guarded", "unguarded", "unattacked", "skipped"]);

const witnessBase = {
  from: z.string(),
  export: z.string(),
  args: z.array(z.unknown()),
};
export const witnessSchema: z.ZodType<Witness> = z.union([
  z.strictObject({ ...witnessBase, expected: z.unknown() }),
  z.strictObject({ ...witnessBase, expectedError: z.string() }),
]) as unknown as z.ZodType<Witness>;

export const criterionCoverageSchema: z.ZodType<CriterionCoverage> = z.strictObject({
  criterion: criterionIdSchema,
  status: coverageStatusSchema,
  reason: z.string().optional(),
}) as unknown as z.ZodType<CriterionCoverage>;

export const witnessExpectationSchema = z.union([
  z.strictObject({ expected: z.unknown() }),
  z.strictObject({ expectedError: z.string() }),
]);

export const witnessOutcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("value"), value: z.unknown() }),
  z.strictObject({ kind: z.literal("error"), className: z.string() }),
  z.strictObject({ kind: z.literal("timeout"), message: z.string() }),
  z.strictObject({ kind: z.literal("no-outcome"), message: z.string() }),
]);

export const invalidWitnessSchema = z.strictObject({
  expected: witnessExpectationSchema,
  originalOutcome: witnessOutcomeSchema,
});

export const mutantResultSchema: z.ZodType<MutantResult> = z.strictObject({
  id: mutantIdSchema,
  species: speciesSchema,
  status: mutantStatusSchema,
  requirement: criterionIdSchema.optional(),
  killingTests: z.array(testIdSchema),
  killClass: killClassSchema.optional(),
  invalidWitness: invalidWitnessSchema.optional(),
}) as unknown as z.ZodType<MutantResult>;

export const runMetadataSchema = z.strictObject({
  gitCommit: z.string(),
  seed: z.number().int(),
  engineVersion: z.string(),
  nodeVersion: z.string(),
  strykerVersion: z.string(),
  vitestVersion: z.string(),
  typescriptVersion: z.string(),
  timestamp: z.string(),
});

export const verdictSchema: z.ZodType<Verdict> = z.strictObject({
  coverage: z.array(criterionCoverageSchema),
  mutants: z.array(mutantResultSchema),
  witnesses: z.record(z.string(), witnessSchema),
  ignoreStaticRetried: z.boolean(),
  metadata: runMetadataSchema,
}) as unknown as z.ZodType<Verdict>;

const engineConfigSchema: z.ZodType<EngineConfig> = z.strictObject({
  specDir: z.string(),
  sourceGlobs: z.array(z.string()),
  testGlobs: z.array(z.string()),
  propertyTestGlobs: z.array(z.string()),
  mutantsDir: z.string(),
  outputDir: z.string(),
  timeoutMs: z.number().optional(),
}) as unknown as z.ZodType<EngineConfig>;

const statusCountsSchema = z.strictObject({
  Killed: z.number().int().nonnegative(),
  Survived: z.number().int().nonnegative(),
  Timeout: z.number().int().nonnegative(),
  Ghost: z.number().int().nonnegative(),
  InvalidWitness: z.number().int().nonnegative(),
  CompileError: z.number().int().nonnegative(),
  NotApplicable: z.number().int().nonnegative(),
});
const coverageCountsSchema = z.strictObject({
  guarded: z.number().int().nonnegative(),
  unguarded: z.number().int().nonnegative(),
  unattacked: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

export const historyRecordSchema: z.ZodType<HistoryRecord> = z.strictObject({
  time: z.string(),
  gitCommit: z.string(),
  seed: z.number().int(),
  config: engineConfigSchema,
  mutants: z.array(z.strictObject({ id: mutantIdSchema, status: mutantStatusSchema })),
  statusCounts: statusCountsSchema,
  coverageCounts: coverageCountsSchema,
  newlyKilledIds: z.array(mutantIdSchema),
}) as unknown as z.ZodType<HistoryRecord>;

// Mutation report (subset of mutation-testing-report-schema 3.x plus two extension fields).
const positionSchema = z.strictObject({
  line: z.number().int().min(1),
  column: z.number().int().min(1),
});
const locationSchema = z.strictObject({ start: positionSchema, end: positionSchema });

export const reportStatusSchema = z.enum([
  "Killed",
  "Survived",
  "NoCoverage",
  "CompileError",
  "RuntimeError",
  "Timeout",
  "Ignored",
  "Pending",
]);

export const reportMutantSchema = z.strictObject({
  id: z.string(),
  mutatorName: z.string(),
  location: locationSchema,
  status: reportStatusSchema,
  replacement: z.string().optional(),
  description: z.string().optional(),
  statusReason: z.string().optional(),
  killedBy: z.array(z.string()).optional(),
  coveredBy: z.array(z.string()).optional(),
  duration: z.number().optional(),
  /** Extension: species of the mutant (Requirement 8.14). Present on Spec_Mutants. */
  species: speciesSchema.optional(),
  /** Extension: the Criterion a Spec_Mutant is tied to (Requirement 8.15). */
  requirement: criterionIdSchema.optional(),
});

export const reportFileSchema = z.strictObject({
  language: z.string(),
  source: z.string(),
  mutants: z.array(reportMutantSchema),
});

export const mutationReportSchema = z.strictObject({
  schemaVersion: z.string(),
  thresholds: z.strictObject({ high: z.number(), low: z.number() }),
  /** Free-form run configuration of the schema. Holds `ignoreStaticRetried` (Requirement 3.5). */
  config: z.record(z.string(), z.unknown()).optional(),
  files: z.record(z.string(), reportFileSchema),
});

export type ReportStatus = z.infer<typeof reportStatusSchema>;
export type ReportLocation = z.infer<typeof locationSchema>;
export type ReportMutant = z.infer<typeof reportMutantSchema>;
export type ReportFile = z.infer<typeof reportFileSchema>;
export type MutationTestingReport = z.infer<typeof mutationReportSchema>;

// ---------------------------------------------------------------------------
// buildVerdict
// ---------------------------------------------------------------------------

export type VerdictInput = {
  coverage: CriterionCoverage[];
  mutants: MutantResult[];
  witnesses: Record<MutantId, Witness>;
  ignoreStaticRetried: boolean;
  metadata: RunMetadata;
  /** Root of the Target_Project, as data. Every path and free-text field is made relative to it (8.17). */
  projectRoot: string;
};

const scrubTestId = (id: TestId, root: string): TestId => scrubAbsolutePaths(id, root) as TestId;

const scrubInvalidWitness = (record: InvalidWitnessRecord, root: string): InvalidWitnessRecord => {
  const expected =
    "expectedError" in record.expected
      ? { expectedError: scrubAbsolutePaths(record.expected.expectedError, root) }
      : record.expected;
  const o = record.originalOutcome;
  const originalOutcome: WitnessOutcome =
    o.kind === "timeout" || o.kind === "no-outcome"
      ? { kind: o.kind, message: scrubAbsolutePaths(o.message, root) }
      : o.kind === "error"
        ? { kind: "error", className: scrubAbsolutePaths(o.className, root) }
        : o;
  return { expected, originalOutcome };
};

const scrubWitness = (w: Witness, root: string): Witness => {
  const from = relativizePath(root, w.from);
  return "expectedError" in w
    ? { ...w, from, expectedError: scrubAbsolutePaths(w.expectedError, root) }
    : { ...w, from };
};

/**
 * Builds the Verdict (8.5, 8.6, 8.13, 8.17). A kill class is kept only on Killed mutants, and a
 * Killed mutant without one is marked "unattributed". The timestamp comes from the input, so the
 * output is a pure function of it. Paths and free text (skip reasons, test ids, error text,
 * NoOutcome messages, witness sources) go through `paths.ts`, so no absolute path is emitted.
 * Validates with the zod schema (8.10) and returns an error message instead of throwing.
 */
export const buildVerdict = (input: VerdictInput): Result<Verdict, string> => {
  const root = input.projectRoot;
  const mutants = input.mutants.map((m): MutantResult => {
    const { killClass, invalidWitness, ...rest } = m;
    const killingTests = m.killingTests.map((t) => scrubTestId(t, root));
    const withInvalid: Partial<MutantResult> =
      m.status === "InvalidWitness" && invalidWitness !== undefined
        ? { invalidWitness: scrubInvalidWitness(invalidWitness, root) }
        : {};
    if (m.status !== "Killed") {
      return { ...rest, ...withInvalid, killingTests };
    }
    return { ...rest, killingTests, killClass: killClass ?? "unattributed" };
  });
  const candidate: Verdict = {
    coverage: input.coverage.map((c) =>
      c.reason === undefined ? { ...c } : { ...c, reason: scrubAbsolutePaths(c.reason, root) },
    ),
    mutants,
    witnesses: Object.fromEntries(
      Object.entries(input.witnesses).map(([id, w]) => [id, scrubWitness(w, root)]),
    ) as Record<MutantId, Witness>,
    ignoreStaticRetried: input.ignoreStaticRetried,
    metadata: { ...input.metadata },
  };
  const parsed = verdictSchema.safeParse(candidate);
  if (!parsed.success) {
    return err(
      `Invalid verdict: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return ok(parsed.data);
};

const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
};

/**
 * Serializes the Verdict as the text of verdict.json (8.12, 8.13). Object keys are sorted
 * recursively, array order is kept, indentation is two spaces and the text ends with a newline.
 * The same Verdict always gives the same text, whatever the key order of its objects. Pure.
 */
export const serializeVerdict = (verdict: Verdict): string =>
  `${JSON.stringify(sortKeysDeep(verdict), null, 2)}\n`;

// ---------------------------------------------------------------------------
// buildMutationReport
// ---------------------------------------------------------------------------

/** A mutant as the CLI hands it to the report builder. Ids are data; this module never computes them. */
export type ReportMutantInput = {
  id: MutantId;
  file: string;
  location: ReportLocation;
  replacement: string;
  status: MutantStatus;
  mutatorName?: string;
  description?: string;
  killedBy?: TestId[];
  coveredBy?: TestId[];
  durationMs?: number;
};

export type SpecReportMutantInput = ReportMutantInput & { requirement: CriterionId };

export type ReportInput = {
  files: Record<string, { language: string; source: string }>;
  mechanical: ReportMutantInput[];
  spec: SpecReportMutantInput[];
  thresholds?: { high: number; low: number };
  /** Whether StrykerJS ran again with `ignoreStatic` (Requirement 3.5). Defaults to false. */
  ignoreStaticRetried?: boolean;
  /** Root of the Target_Project, as data. Every path and free-text field is made relative to it (8.17). */
  projectRoot: string;
};

export const REPORT_SCHEMA_VERSION = "2";
export const DEFAULT_THRESHOLDS = { high: 80, low: 60 } as const;

const OATHBREAKER: Species = "Oathbreaker";

const mapStatus = (status: MutantStatus): { status: ReportStatus; statusReason?: string } => {
  switch (status) {
    case "Killed":
      return { status: "Killed" };
    case "Survived":
      return { status: "Survived" };
    case "Timeout":
      return { status: "Timeout" };
    case "CompileError":
      return { status: "CompileError" };
    case "Ghost":
    case "InvalidWitness":
    case "NotApplicable":
      return { status: "Ignored", statusReason: `Engine status: ${status}` };
  }
};

const changeKey = (m: ReportMutantInput): string =>
  JSON.stringify([
    m.file,
    m.location.start.line,
    m.location.start.column,
    m.location.end.line,
    m.location.end.column,
    m.replacement,
  ]);

const toReportMutant = (
  m: ReportMutantInput,
  extra: { species?: Species; requirement?: CriterionId },
  root: string,
): ReportMutant => {
  const mapped = mapStatus(m.status);
  const scrub = (s: string): string => scrubAbsolutePaths(s, root);
  return {
    id: m.id,
    mutatorName: scrub(m.mutatorName ?? extra.species ?? "Mechanical"),
    location: m.location,
    status: mapped.status,
    replacement: m.replacement,
    ...(m.description === undefined ? {} : { description: scrub(m.description) }),
    ...(mapped.statusReason === undefined ? {} : { statusReason: scrub(mapped.statusReason) }),
    ...(m.killedBy === undefined ? {} : { killedBy: m.killedBy.map(scrub) }),
    ...(m.coveredBy === undefined ? {} : { coveredBy: m.coveredBy.map(scrub) }),
    ...(m.durationMs === undefined ? {} : { duration: m.durationMs }),
    ...(extra.species === undefined ? {} : { species: extra.species }),
    ...(extra.requirement === undefined ? {} : { requirement: extra.requirement }),
  };
};

const compareMutants = (a: ReportMutant, b: ReportMutant): number =>
  a.location.start.line - b.location.start.line ||
  a.location.start.column - b.location.start.column ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Builds the Mutation_Report. Includes Mechanical_Mutants and Spec_Mutants (8.2), maps engine
 * statuses (8.3, 8.4), assigns Oathbreaker to every Spec_Mutant (8.14) and keeps only the
 * Spec_Mutant when a Mechanical_Mutant makes the same change, compared by file, span and
 * replacement and not by id (8.15). Output order is deterministic. Pure.
 */
export const buildMutationReport = (input: ReportInput): MutationTestingReport => {
  const root = input.projectRoot;
  const rel = (file: string): string => relativizePath(root, file);
  const mechanical = input.mechanical.map((m) => ({ ...m, file: rel(m.file) }));
  const spec = input.spec.map((m) => ({ ...m, file: rel(m.file) }));
  const inputFiles = new Map(Object.entries(input.files).map(([p, meta]) => [rel(p), meta]));
  const specKeys = new Set(spec.map(changeKey));
  const perFile = new Map<string, ReportMutant[]>();
  const push = (file: string, m: ReportMutant): void => {
    const list = perFile.get(file);
    if (list === undefined) perFile.set(file, [m]);
    else list.push(m);
  };
  for (const m of mechanical) {
    if (specKeys.has(changeKey(m))) continue;
    push(m.file, toReportMutant(m, {}, root));
  }
  for (const m of spec) {
    push(m.file, toReportMutant(m, { species: OATHBREAKER, requirement: m.requirement }, root));
  }
  const paths = [...new Set([...inputFiles.keys(), ...perFile.keys()])].sort();
  const files: Record<string, ReportFile> = {};
  for (const path of paths) {
    const meta = inputFiles.get(path) ?? { language: "typescript", source: "" };
    files[path] = {
      language: meta.language,
      source: meta.source,
      mutants: (perFile.get(path) ?? []).sort(compareMutants),
    };
  }
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    thresholds: { ...(input.thresholds ?? DEFAULT_THRESHOLDS) },
    config: { ignoreStaticRetried: input.ignoreStaticRetried ?? false },
    files,
  };
};

// ---------------------------------------------------------------------------
// History (8.8, 8.9, 8.10)
// ---------------------------------------------------------------------------

const MUTANT_STATUSES: MutantStatus[] = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
];
const COVERAGE_STATUSES: CoverageStatus[] = ["guarded", "unguarded", "unattacked", "skipped"];

/**
 * Builds the history record of a run (8.8, 8.9). Time, commit and seed come from the Verdict
 * metadata, so the output is a pure function of the inputs. `newlyKilledIds` lists the Killed
 * mutants that the previous record did not list as Killed. Validates with the zod schema (8.10)
 * and returns an error message instead of throwing. Config paths are made relative to
 * `projectRoot` (8.17).
 */
export const buildHistoryRecord = (
  verdict: Verdict,
  previousRecord: HistoryRecord | undefined,
  config: EngineConfig,
  projectRoot: string,
): Result<HistoryRecord, string> => {
  const rel = (p: string): string => relativizePath(projectRoot, p);
  const relConfig: EngineConfig = {
    specDir: rel(config.specDir),
    sourceGlobs: config.sourceGlobs.map(rel),
    testGlobs: config.testGlobs.map(rel),
    propertyTestGlobs: config.propertyTestGlobs.map(rel),
    mutantsDir: rel(config.mutantsDir),
    outputDir: rel(config.outputDir),
    ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
  };
  const statusCounts = Object.fromEntries(MUTANT_STATUSES.map((s) => [s, 0])) as Record<
    MutantStatus,
    number
  >;
  for (const m of verdict.mutants) statusCounts[m.status] += 1;
  const coverageCounts = Object.fromEntries(COVERAGE_STATUSES.map((s) => [s, 0])) as Record<
    CoverageStatus,
    number
  >;
  for (const c of verdict.coverage) coverageCounts[c.status] += 1;
  const previouslyKilled = new Set(
    (previousRecord?.mutants ?? []).filter((m) => m.status === "Killed").map((m) => m.id),
  );
  const candidate: HistoryRecord = {
    time: verdict.metadata.timestamp,
    gitCommit: verdict.metadata.gitCommit,
    seed: verdict.metadata.seed,
    config: relConfig,
    mutants: verdict.mutants.map((m) => ({ id: m.id, status: m.status })),
    statusCounts,
    coverageCounts,
    newlyKilledIds: verdict.mutants
      .filter((m) => m.status === "Killed" && !previouslyKilled.has(m.id))
      .map((m) => m.id),
  };
  const parsed = historyRecordSchema.safeParse(candidate);
  if (!parsed.success) {
    return err(
      `Invalid history record: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return ok(parsed.data);
};

/** Returns the old records unchanged plus the new one. Pure. */
export const appendHistory = (
  records: readonly HistoryRecord[],
  record: HistoryRecord,
): HistoryRecord[] => [...records, record];

// ---------------------------------------------------------------------------
// history.jsonl: JSON Lines, one HistoryRecord per line (8.16)
// ---------------------------------------------------------------------------

/** A malformed or schema-invalid line of history.jsonl. `line` is 1-based. */
export type HistoryError = { line: number; message: string };

/**
 * One HistoryRecord as a single-line JSON object without a trailing newline. JSON.stringify
 * escapes newlines inside strings, so the output has no raw `\n`. Validates with the zod
 * schema first and throws on an invalid record (8.10, 8.16).
 */
export const serializeHistoryRecord = (record: HistoryRecord): string => {
  const parsed = historyRecordSchema.safeParse(record);
  if (!parsed.success) {
    throw new Error(
      `Invalid history record: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return JSON.stringify(parsed.data);
};

/**
 * Parses the text of history.jsonl. Each non-empty line is one JSON object; records keep their
 * file order. A malformed or schema-invalid line returns an error that names its line number.
 */
export const parseHistoryLines = (text: string): Result<HistoryRecord[], HistoryError> => {
  const records: HistoryRecord[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] as string;
    if (raw.trim() === "") continue;
    const line = i + 1;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      return err({ line, message: `Line ${line}: malformed JSON (${(e as Error).message})` });
    }
    const parsed = historyRecordSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ");
      return err({ line, message: `Line ${line}: invalid history record (${issues})` });
    }
    records.push(parsed.data);
  }
  return ok(records);
};
