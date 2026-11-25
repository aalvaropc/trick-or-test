// The `trick-or-test/report` subpath: report types and zod schemas only.
// It must stay free of `node:` imports (Requirement 10.4) and must not reach core/mutant-id.ts (Requirement 10.1).

export type {
  MutationTestingReport,
  ReportFile,
  ReportLocation,
  ReportMutant,
  ReportStatus,
} from "../core/report.js";
export {
  coverageStatusSchema,
  criterionCoverageSchema,
  historyRecordSchema,
  killClassSchema,
  mutantResultSchema,
  mutantStatusSchema,
  mutationReportSchema,
  reportFileSchema,
  reportMutantSchema,
  reportStatusSchema,
  runMetadataSchema,
  speciesSchema,
  verdictSchema,
  witnessSchema,
} from "../core/report.js";
export type {
  CoverageStatus,
  Criterion,
  CriterionCoverage,
  CriterionId,
  HistoryRecord,
  KillClass,
  MutantId,
  MutantResult,
  MutantStatus,
  RunMetadata,
  Species,
  TestId,
  Verdict,
  Witness,
} from "../core/types.js";
