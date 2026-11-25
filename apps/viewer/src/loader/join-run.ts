import type { HistoryRecord, Verdict } from "trick-or-test/report";
import type { LoadError, ParsedFile, RawRun, Result } from "./types.js";

const orderHistory = (records: HistoryRecord[]): HistoryRecord[] =>
  records
    .map((record, index) => ({ record, index, at: Date.parse(record.time) }))
    .sort((a, b) => {
      if (a.at !== b.at) return a.at - b.at;
      if (a.record.time !== b.record.time) return a.record.time < b.record.time ? -1 : 1;
      return a.index - b.index;
    })
    .map((x) => x.record);

/** Joins parsed files into one RawRun. Never mutates its inputs. */
export const joinRun = (files: ParsedFile[]): Result<RawRun, LoadError> => {
  const reportFile = files.find((f) => f.kind === "mutation-report");
  if (reportFile === undefined || reportFile.kind !== "mutation-report") {
    return {
      ok: false,
      error: { fileName: "", message: "A Mutation_Report is required." },
    };
  }
  const { report } = reportFile;

  const ids = new Set<string>();
  for (const file of Object.values(report.files)) {
    for (const mutant of file.mutants) ids.add(mutant.id);
  }

  let verdict: Verdict | undefined;
  let ignored = 0;
  const verdictFile = files.find((f) => f.kind === "verdict");
  if (verdictFile !== undefined && verdictFile.kind === "verdict") {
    const kept = verdictFile.verdict.mutants.filter((m) => ids.has(m.id));
    ignored = verdictFile.verdict.mutants.length - kept.length;
    verdict = { ...verdictFile.verdict, mutants: kept };
  }

  const records: HistoryRecord[] = [];
  for (const f of files) if (f.kind === "history") records.push(...f.records);

  return {
    ok: true,
    value: { report, verdict, history: orderHistory(records), ignoredVerdictEntryCount: ignored },
  };
};
