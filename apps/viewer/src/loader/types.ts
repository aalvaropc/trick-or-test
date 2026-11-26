import type { HistoryRecord, MutationTestingReport, Verdict } from "trick-or-test/report";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type LoadError = {
  fileName: string;
  message: string;
  /** 1-based, History_File errors only; counts blank lines. */
  line?: number;
  fieldPaths?: string[];
  truncatedCount?: number;
};

/** The parsed files of one run, joined by mutant id. `verdict` keeps only entries the report contains. */
export type RawRun = {
  report: MutationTestingReport;
  verdict: Verdict | undefined;
  /** Ordered by `time` ascending, file order for equal `time`. */
  history: HistoryRecord[];
  ignoredVerdictEntryCount: number;
};

export type FileKind = "mutation-report" | "verdict" | "history" | "unknown";

/** A file that passed its schema. `history` holds records in file order. */
export type ParsedFile =
  | { kind: "mutation-report"; fileName: string; report: MutationTestingReport }
  | { kind: "verdict"; fileName: string; verdict: Verdict }
  | { kind: "history"; fileName: string; records: HistoryRecord[] };
