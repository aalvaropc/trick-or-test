import { z } from "zod";
import { relativizePath, scrubAbsolutePaths } from "./paths.js";
import { err, ok, type Result } from "./result.js";
import { isSpecMutantId, scopeOf } from "./run-scope.js";
import { computeMutantCounts, computeStrykerCounts } from "./totals.js";
import { dropTwins } from "./twins.js";
import type {
  BaselineTest,
  Claim,
  ClaimCounts,
  CoverageStatus,
  CriterionCoverage,
  CriterionId,
  EngineConfig,
  HistoryRecord,
  InvalidWitnessRecord,
  MutantId,
  MutantResult,
  MutantStatus,
  RequirementTitle,
  RunMetadata,
  RunScope,
  Species,
  TestId,
  Verdict,
  VerdictWitness,
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
  text: z.string().optional(),
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

export const verdictWitnessSchema: z.ZodType<VerdictWitness> = z.union([
  z.strictObject({
    ...witnessBase,
    expected: z.unknown(),
    mutatedOutcome: witnessOutcomeSchema.optional(),
  }),
  z.strictObject({
    ...witnessBase,
    expectedError: z.string(),
    mutatedOutcome: witnessOutcomeSchema.optional(),
  }),
]) as unknown as z.ZodType<VerdictWitness>;

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

export const runScopeSchema = z.enum(["full", "spec-only"]);

export const runMetadataSchema = z.strictObject({
  gitCommit: z.string(),
  seed: z.number().int(),
  engineVersion: z.string(),
  nodeVersion: z.string(),
  strykerVersion: z.string(),
  vitestVersion: z.string(),
  typescriptVersion: z.string(),
  timestamp: z.string(),
  specName: z.string().optional(),
  scope: runScopeSchema.optional(),
});

/** One Requirement title of the Verdict (8.26). */
export const requirementTitleSchema: z.ZodType<RequirementTitle> = z.strictObject({
  requirement: z.number().int().positive(),
  title: z.string().min(1),
}) as unknown as z.ZodType<RequirementTitle>;

const count = (): z.ZodNumber => z.number().int().nonnegative();

/** Count per Mutant_Status. All seven keys are required (8.22). */
export const statusCountsSchema = z.strictObject({
  Killed: count(),
  Survived: count(),
  Timeout: count(),
  Ghost: count(),
  InvalidWitness: count(),
  CompileError: count(),
  NotApplicable: count(),
});

/** Counts of the mutants listed in the Verdict_File, the Mutation_Report and the HistoryRecord (8.22). */
export const mutantCountsSchema = z.strictObject({
  spec: statusCountsSchema,
  mechanical: statusCountsSchema.optional(),
  twinsMerged: count().describe(
    "Number of Twins dropped by rule 8.15. A Twin is in no output file. This is not part of mutantCounts.spec or mutantCounts.mechanical, and strykerCounts.total counts Twins while mutantCounts does not.",
  ),
});

/** Counts over every Mechanical_Mutant that StrykerJS produced (8.23). */
export const strykerCountsSchema = z.strictObject({
  detected: count().describe(
    "Killed plus Timeout, over every Mechanical_Mutant StrykerJS produced.",
  ),
  undetected: count().describe("Survived, over every Mechanical_Mutant StrykerJS produced."),
  total: count().describe(
    "Counts the Mechanical_Mutants that StrykerJS produced, Twins included. It is not the number of mutants listed in the files. A plain StrykerJS mutation score has the denominator detected + undetected, not total.",
  ),
});

export const testKindSchema = z.enum(["property", "example"]);

export const claimOutcomeSchema = z
  .enum(["held", "not-held", "unchecked", "unknown-criterion"])
  .describe("Whether the claim held or did not hold, judged by the Spec_Mutants of the criterion.");

/** A claim of a test. `otherTestsKilledAll` is required for `not-held` and refused otherwise (11.11). */
export const claimSchema: z.ZodType<Claim> = z
  .strictObject({
    criterion: z.string(),
    outcome: claimOutcomeSchema,
    otherTestsKilledAll: z
      .boolean()
      .optional()
      .describe(
        "Only on a claim that did not hold: true when every valid Spec_Mutant of the criterion was killed by another test or timed out.",
      ),
  })
  .superRefine((claim, ctx) => {
    const has = claim.otherTestsKilledAll !== undefined;
    if (claim.outcome === "not-held" && !has) {
      ctx.addIssue({
        code: "custom",
        path: ["otherTestsKilledAll"],
        message: "otherTestsKilledAll is required when the outcome is not-held",
      });
    }
    if (claim.outcome !== "not-held" && has) {
      ctx.addIssue({
        code: "custom",
        path: ["otherTestsKilledAll"],
        message: "otherTestsKilledAll is allowed only when the outcome is not-held",
      });
    }
  }) as unknown as z.ZodType<Claim>;

/** Number of claims in total and per outcome (11.12). */
export const claimCountsSchema: z.ZodType<ClaimCounts> = z.strictObject({
  total: count(),
  held: count(),
  notHeld: count(),
  unchecked: count(),
  unknownCriterion: count(),
  notHeldOthersKilledAll: count(),
  notHeldOthersDidNot: count(),
}) as unknown as z.ZodType<ClaimCounts>;

/** One test that the Baseline_Run ran and that passed (6.11). */
export const baselineTestSchema: z.ZodType<BaselineTest> = z.strictObject({
  id: testIdSchema,
  kind: testKindSchema,
  claims: z.array(claimSchema).optional(),
}) as unknown as z.ZodType<BaselineTest>;

export const verdictSchema: z.ZodType<Verdict> = z.strictObject({
  coverage: z.array(criterionCoverageSchema),
  mutants: z.array(mutantResultSchema),
  witnesses: z.record(z.string(), verdictWitnessSchema),
  ignoreStaticRetried: z.boolean(),
  metadata: runMetadataSchema,
  mutantCounts: mutantCountsSchema.optional(),
  strykerCounts: strykerCountsSchema.optional(),
  baselineTests: z.array(baselineTestSchema).optional(),
  claimCounts: claimCountsSchema.optional(),
  requirements: z.array(requirementTitleSchema).optional(),
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
  coverageByCriterion: z
    .array(z.strictObject({ criterion: criterionIdSchema, status: coverageStatusSchema }))
    .optional(),
  scope: runScopeSchema.optional(),
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

const OATHBREAKER: Species = "Oathbreaker";

export type VerdictInput = {
  coverage: CriterionCoverage[];
  mutants: MutantResult[];
  witnesses: Record<MutantId, VerdictWitness>;
  ignoreStaticRetried: boolean;
  metadata: RunMetadata;
  /** Root of the Target_Project, as data. Every path and free-text field is made relative to it (8.17). */
  projectRoot: string;
  /**
   * The change each mutant makes, as data, so that the builder can find Twins (8.15, 8.21). A mutant
   * without an entry is never a Twin. When absent, no Twin is dropped and the Verdict gets neither
   * `mutantCounts` nor `strykerCounts`.
   */
  changes?: Record<MutantId, MutantChange>;
  /** Run_Scope (8.28). Defaults to `full`. */
  scope?: RunScope;
  /** Passed tests of the Baseline_Run (6.11). When absent, the Verdict has no `baselineTests`. */
  baselineTests?: BaselineTest[];
  /** Number of Claims in total and per outcome (11.12). Written as `claimCounts` when present. */
  claimCounts?: ClaimCounts;
  /** The attacked spec. Written as `metadata.specName` when present (8.25). */
  specName?: string;
  /** Requirement titles in document order. Written as `requirements` when present (8.26). */
  requirements?: RequirementTitle[];
};

/** What a mutant changes: the fields that rule 8.15 compares. */
export type MutantChange = {
  file: string;
  location: ReportLocation;
  replacement: string;
};

/**
 * Applies `dropTwins` (8.15) to a list of mutant results. Spec_Mutants are the results of species
 * Oathbreaker. A result without a known change gets a key of its own, so it never matches. Pure.
 */
const dropResultTwins = (
  mutants: readonly MutantResult[],
  changes: Record<MutantId, MutantChange> | undefined,
  root: string,
): { kept: MutantResult[]; twinsMerged: number } => {
  if (changes === undefined) return { kept: [...mutants], twinsMerged: 0 };
  const zero = { line: 0, column: 0 };
  const tagged = mutants.map((m) => {
    const change = changes[m.id];
    return {
      result: m,
      kind: m.species === OATHBREAKER ? ("spec" as const) : ("mechanical" as const),
      file: change === undefined ? `\u0000${m.id}` : relativizePath(root, change.file),
      location: change?.location ?? { start: zero, end: zero },
      replacement: change?.replacement ?? "",
    };
  });
  const { kept, twinsMerged } = dropTwins(tagged);
  return { kept: kept.map((k) => k.result), twinsMerged };
};

const scrubTestId = (id: TestId, root: string): TestId => scrubAbsolutePaths(id, root) as TestId;

const scrubOutcome = (o: WitnessOutcome, root: string): WitnessOutcome =>
  o.kind === "timeout" || o.kind === "no-outcome"
    ? { kind: o.kind, message: scrubAbsolutePaths(o.message, root) }
    : o.kind === "error"
      ? { kind: "error", className: scrubAbsolutePaths(o.className, root) }
      : o;

const scrubInvalidWitness = (record: InvalidWitnessRecord, root: string): InvalidWitnessRecord => {
  const expected =
    "expectedError" in record.expected
      ? { expectedError: scrubAbsolutePaths(record.expected.expectedError, root) }
      : record.expected;
  return { expected, originalOutcome: scrubOutcome(record.originalOutcome, root) };
};

const scrubWitness = (w: VerdictWitness, root: string): VerdictWitness => {
  const { mutatedOutcome, ...rest } = w;
  const from = relativizePath(root, rest.from);
  const scrubbed: VerdictWitness =
    "expectedError" in rest
      ? { ...rest, from, expectedError: scrubAbsolutePaths(rest.expectedError, root) }
      : { ...rest, from };
  return mutatedOutcome === undefined
    ? scrubbed
    : { ...scrubbed, mutatedOutcome: scrubOutcome(mutatedOutcome, root) };
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
  const scope = input.scope ?? "full";
  // Counts of the StrykerJS run come from the raw list, before the Twins go (8.23).
  const strykerCounts = computeStrykerCounts(
    input.mutants.filter((m) => m.species !== OATHBREAKER),
  );
  const { kept, twinsMerged } = dropResultTwins(input.mutants, input.changes, root);
  const mutantCounts = computeMutantCounts(
    kept.map((m) => ({
      kind: m.species === OATHBREAKER ? ("spec" as const) : ("mechanical" as const),
      status: m.status,
    })),
    twinsMerged,
    scope,
  );
  const mutants = kept.map((m): MutantResult => {
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
    coverage: input.coverage.map((c) => {
      const { reason, text, ...rest } = c;
      return {
        ...rest,
        ...(reason === undefined ? {} : { reason: scrubAbsolutePaths(reason, root) }),
        ...(text === undefined ? {} : { text: scrubAbsolutePaths(text.trim(), root) }),
      };
    }),
    mutants,
    witnesses: Object.fromEntries(
      Object.entries(input.witnesses).map(([id, w]) => [id, scrubWitness(w, root)]),
    ) as Record<MutantId, VerdictWitness>,
    ignoreStaticRetried: input.ignoreStaticRetried,
    metadata: {
      ...input.metadata,
      ...(input.specName === undefined ? {} : { specName: input.specName }),
    },
    // The counts are written when the caller passes `changes`, that is, when it hands over the raw
    // list. Without it the totals would describe a list that may still hold Twins.
    ...(input.changes === undefined ? {} : { mutantCounts }),
    ...(input.changes === undefined || scope === "spec-only" ? {} : { strykerCounts }),
    ...(input.baselineTests === undefined
      ? {}
      : { baselineTests: input.baselineTests.map((t) => ({ ...t, id: scrubTestId(t.id, root) })) }),
    ...(input.claimCounts === undefined ? {} : { claimCounts: { ...input.claimCounts } }),
    ...(input.requirements === undefined
      ? {}
      : {
          requirements: input.requirements.map((r) => ({
            requirement: r.requirement,
            title: scrubAbsolutePaths(r.title.trim(), root),
          })),
        }),
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
  const { kept } = dropTwins([
    ...mechanical.map((m) => ({ ...m, kind: "mechanical" as const })),
    ...spec.map((m) => ({ ...m, kind: "spec" as const })),
  ]);
  const perFile = new Map<string, ReportMutant[]>();
  const push = (file: string, m: ReportMutant): void => {
    const list = perFile.get(file);
    if (list === undefined) perFile.set(file, [m]);
    else list.push(m);
  };
  for (const m of kept) {
    if (m.kind === "mechanical") push(m.file, toReportMutant(m, {}, root));
    else {
      push(m.file, toReportMutant(m, { species: OATHBREAKER, requirement: m.requirement }, root));
    }
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
  changes?: Record<MutantId, MutantChange>,
): Result<HistoryRecord, string> => {
  const listed = dropResultTwins(verdict.mutants, changes, projectRoot).kept;
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
  for (const m of listed) statusCounts[m.status] += 1;
  const coverageCounts = Object.fromEntries(COVERAGE_STATUSES.map((s) => [s, 0])) as Record<
    CoverageStatus,
    number
  >;
  for (const c of verdict.coverage) coverageCounts[c.status] += 1;
  // A spec-only run compares Spec_Mutant ids only, on both sides (8.30).
  const specOnly = scopeOf(verdict.metadata) === "spec-only";
  const compared = (id: MutantId): boolean => !specOnly || isSpecMutantId(id);
  const previouslyKilled = new Set(
    (previousRecord?.mutants ?? [])
      .filter((m) => m.status === "Killed" && compared(m.id))
      .map((m) => m.id),
  );
  const candidate: HistoryRecord = {
    time: verdict.metadata.timestamp,
    gitCommit: verdict.metadata.gitCommit,
    seed: verdict.metadata.seed,
    config: relConfig,
    mutants: listed.map((m) => ({ id: m.id, status: m.status })),
    statusCounts,
    coverageCounts,
    newlyKilledIds: listed
      .filter((m) => m.status === "Killed" && compared(m.id) && !previouslyKilled.has(m.id))
      .map((m) => m.id),
    coverageByCriterion: verdict.coverage.map((c) => ({
      criterion: c.criterion,
      status: c.status,
    })),
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
