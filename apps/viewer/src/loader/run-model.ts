import type {
  CriterionId,
  HistoryRecord,
  MutantResult,
  MutationTestingReport,
  ReportLocation,
  ReportStatus,
  Species,
  Verdict,
} from "trick-or-test/report";
import { speciesOf } from "../bestiary/species.js";
import { type CreatureState, deriveState } from "../bestiary/state.js";
import type { RawRun } from "./types.js";

export type Mutant = {
  id: string;
  file: string;
  location: ReportLocation;
  mutatorName: string;
  reportStatus: ReportStatus;
  statusReason: string | undefined;
  /** Source text at `location`, when derivable. */
  original: string | undefined;
  replacement: string | undefined;
  requirement: CriterionId | undefined;
  /** Present only when a Verdict_File joined this id. */
  verdictEntry: MutantResult | undefined;
  /** Derived once here, so every screen sees the same value. */
  species: Species;
  state: CreatureState | "not-counted";
};

export type RunModel = {
  report: MutationTestingReport;
  verdict: Verdict | undefined;
  history: HistoryRecord[];
  ignoredVerdictEntryCount: number;
  /** Every report mutant, including not-counted ones. */
  mutants: Mutant[];
};

/** Slices `source` by a 1-based line/column range (end column exclusive). Undefined if empty or out of range. */
const sliceSource = (source: string, location: ReportLocation): string | undefined => {
  const lines = source.split(/\r?\n/);
  const { start, end } = location;
  const first = lines[start.line - 1];
  const last = lines[end.line - 1];
  if (first === undefined || last === undefined || end.line < start.line) return undefined;
  const text =
    start.line === end.line
      ? first.slice(start.column - 1, end.column - 1)
      : [
          first.slice(start.column - 1),
          ...lines.slice(start.line, end.line - 1),
          last.slice(0, end.column - 1),
        ].join("\n");
  return text === "" ? undefined : text;
};

/** Builds the RunModel from a RawRun. Pure; never mutates `raw`. */
export const buildRunModel = (raw: RawRun): RunModel => {
  const entries = new Map<string, MutantResult>();
  for (const entry of raw.verdict?.mutants ?? []) entries.set(entry.id, entry);

  const mutants: Mutant[] = [];
  for (const [file, reportFile] of Object.entries(raw.report.files)) {
    for (const m of reportFile.mutants) {
      const verdictEntry = entries.get(m.id);
      const requirement = verdictEntry?.requirement ?? m.requirement;
      const species =
        verdictEntry?.species ?? m.species ?? speciesOf(m.mutatorName, requirement !== undefined);
      mutants.push({
        id: m.id,
        file,
        location: m.location,
        mutatorName: m.mutatorName,
        reportStatus: m.status,
        statusReason: m.statusReason,
        original: sliceSource(reportFile.source, m.location),
        replacement: m.replacement,
        requirement,
        verdictEntry,
        species,
        state: deriveState({
          reportStatus: m.status,
          statusReason: m.statusReason,
          verdictEntry,
        }),
      });
    }
  }

  return {
    report: raw.report,
    verdict: raw.verdict,
    history: raw.history,
    ignoredVerdictEntryCount: raw.ignoredVerdictEntryCount,
    mutants,
  };
};
