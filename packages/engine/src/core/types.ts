import type { WitnessExpectation, WitnessOutcome } from "./witness-compare.js";

// Branded ids (ADR 0005).
// A Spec_Mutant's MutantId is the id from its file (oath-<criterion>-<slug>), unique per Requirement 4.5.
// A Mechanical_Mutant's MutantId is the sha256 hash of file, original text and replacement (Requirement 8.7).
export type MutantId = string & { readonly __brand: "MutantId" };
/** "<requirement>.<criterion>" */
export type CriterionId = string & { readonly __brand: "CriterionId" };
/** File path + test full name. */
export type TestId = string & { readonly __brand: "TestId" };

export type Criterion = {
  id: CriterionId;
  requirement: number;
  criterion: number;
  text: string;
  line: number;
};

export type Species =
  | "Borderling"
  | "Miscount"
  | "Two-Face"
  | "Hollow"
  | "Impostor"
  | "Oathbreaker"
  | "Unclassified";

export type MutantStatus =
  | "Killed"
  | "Survived"
  | "Timeout"
  | "Ghost"
  | "InvalidWitness"
  | "CompileError"
  | "NotApplicable";

export type KillClass = "examples-only" | "properties-only" | "both" | "unattributed";

export type CoverageStatus = "guarded" | "unguarded" | "unattacked" | "skipped";

export type Witness = {
  from: string;
  export: string;
  args: unknown[];
} & ({ expected: unknown } | { expectedError: string });

export type SpecMutant = {
  id: MutantId;
  requirement: CriterionId;
  file: string;
  original: string;
  mutated: string;
  why: string;
  witness: Witness;
};

export type SkipEntry = { requirement: CriterionId; reason: string };

export type InvalidWitnessRecord = {
  expected: WitnessExpectation;
  originalOutcome: WitnessOutcome;
};

export type MutantResult = {
  id: MutantId;
  species: Species;
  status: MutantStatus;
  /** Present for Spec_Mutants, absent for strays. */
  requirement?: CriterionId;
  killingTests: TestId[];
  /** Present only when status is Killed; a Timeout has no failing tests, so no kill class. */
  killClass?: KillClass;
  /** Present only when status is InvalidWitness (Requirement 5.6). */
  invalidWitness?: InvalidWitnessRecord;
};

export type EngineConfig = {
  specDir: string;
  sourceGlobs: string[];
  testGlobs: string[];
  propertyTestGlobs: string[];
  mutantsDir: string;
  outputDir: string;
  /** Unset when absent: suite time limit = baseline * 1.5 + 5 s (Requirements 1.7, 5.15). */
  timeoutMs?: number;
};

export type CriterionCoverage = {
  criterion: CriterionId;
  status: CoverageStatus;
  /** Present only when status is "skipped". */
  reason?: string;
  /** Full text of the criterion from requirements.md (Requirements 8.18, 8.20). Optional so older verdicts parse. */
  text?: string;
};

export type RunMetadata = {
  gitCommit: string;
  seed: number;
  engineVersion: string;
  nodeVersion: string;
  strykerVersion: string;
  vitestVersion: string;
  typescriptVersion: string;
  /** Excluded from byte-identity comparisons (Requirement 8.13). */
  timestamp: string;
};

/** A Witness as the Verdict stores it. `mutatedOutcome` is present only when the witness ran against the mutated code (Requirements 8.19, 8.20). */
export type VerdictWitness = Witness & { mutatedOutcome?: WitnessOutcome };

/** Requirements 8.22 to 8.24. Two totals, two names, no shared key. All seven statuses are present. */
export type StatusCounts = Record<MutantStatus, number>;

export type MutantCounts = {
  /** Spec_Mutants listed in the three files. */
  spec: StatusCounts;
  /** Absent when the Run_Scope is `spec-only`. */
  mechanical?: StatusCounts;
  /** Twins dropped by rule 8.15. They are in no file. */
  twinsMerged: number;
};

export type StrykerCounts = {
  /** Killed plus Timeout, over every Mechanical_Mutant that StrykerJS produced. */
  detected: number;
  /** Survived, same population. */
  undetected: number;
  /** Every Mechanical_Mutant that StrykerJS produced, Twins and CompileError ones included. Not the denominator of the StrykerJS score. */
  total: number;
};

export type Verdict = {
  coverage: CriterionCoverage[];
  mutants: MutantResult[];
  witnesses: Record<MutantId, VerdictWitness>;
  ignoreStaticRetried: boolean;
  metadata: RunMetadata;
  mutantCounts?: MutantCounts;
  strykerCounts?: StrykerCounts;
};

export type HistoryRecord = {
  time: string;
  gitCommit: string;
  seed: number;
  config: EngineConfig;
  mutants: { id: MutantId; status: MutantStatus }[];
  statusCounts: Record<MutantStatus, number>;
  coverageCounts: Record<CoverageStatus, number>;
  newlyKilledIds: MutantId[];
};
