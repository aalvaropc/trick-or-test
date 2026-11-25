import type { CriterionId, KillClass, ReportStatus, Species } from "trick-or-test/report";
import type { Mutant, RunModel } from "../loader/run-model.js";

export type ColumnId =
  | "id"
  | "species"
  | "state"
  | "status"
  | "requirement"
  | "file"
  | "line"
  | "killClass";

export type PlainRow = {
  mutantId: string;
  species: Species;
  /** "survived" | "killed by <test>" | "no test runs this code" | "ghost, not counted" | "not counted" */
  stateLabel: string;
  status: ReportStatus;
  requirement: CriterionId | undefined;
  file: string;
  line: number;
  killClass: KillClass | undefined;
};

type CellValue = string | number | undefined;

export type Column = {
  id: ColumnId;
  label: string;
  accessor: (row: PlainRow) => CellValue;
  /** Ascending order. Missing values sort after present ones. */
  compare: (a: PlainRow, b: PlainRow) => number;
};

const compareValues = (a: CellValue, b: CellValue): number => {
  if (a === undefined || b === undefined) {
    return a === b ? 0 : a === undefined ? 1 : -1;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

const column = (id: ColumnId, label: string, accessor: (row: PlainRow) => CellValue): Column => ({
  id,
  label,
  accessor,
  compare: (a, b) => compareValues(accessor(a), accessor(b)),
});

export const COLUMNS: readonly Column[] = [
  column("id", "Mutant", (r) => r.mutantId),
  column("species", "Species", (r) => r.species),
  column("state", "State", (r) => r.stateLabel),
  column("status", "Status", (r) => r.status),
  column("requirement", "Criterion", (r) => r.requirement),
  column("file", "File", (r) => r.file),
  column("line", "Line", (r) => r.line),
  column("killClass", "Kill class", (r) => r.killClass),
];

const stateLabel = (m: Mutant): string => {
  switch (m.state) {
    case "survivor":
      return "survived";
    case "killed": {
      const tests = m.verdictEntry?.killingTests ?? [];
      return tests.length > 0 ? `killed by ${tests.join(", ")}` : "killed";
    }
    case "in-the-dark":
      return "no test runs this code";
    case "ghost":
      return "ghost, not counted";
    default:
      return "not counted";
  }
};

/** One row per Mutant, including not-counted ones. Pure. */
export const buildRows = (model: RunModel): PlainRow[] =>
  model.mutants.map((m) => ({
    mutantId: m.id,
    species: m.species,
    stateLabel: stateLabel(m),
    status: m.reportStatus,
    requirement: m.requirement,
    file: m.file,
    line: m.location.start.line,
    killClass: m.verdictEntry?.killClass,
  }));
