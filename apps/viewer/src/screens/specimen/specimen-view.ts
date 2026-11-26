import type { KillClass, VerdictWitness } from "trick-or-test/report";
import type { CreatureState } from "../../bestiary/state.js";
import type { Mutant, RunModel } from "../../loader/run-model.js";

/** Most test names the Specimen screen lists (7.5, 7.6). */
export const MAX_TEST_NAMES = 50;

type WitnessOutcome = NonNullable<VerdictWitness["mutatedOutcome"]>;

export type OutcomeView = { kind: WitnessOutcome["kind"]; text: string };

export type WitnessView = {
  /** The call, for example `total(1, 2)`. */
  input: string;
  expected: { kind: "value" | "error"; text: string };
  /** Absent when the witness never ran against the mutated code (7.12). */
  mutated: OutcomeView | undefined;
};

export type TestList = {
  /** At most MAX_TEST_NAMES names. */
  names: string[];
  /** Names beyond the limit, not shown. */
  hidden: number;
};

export type CodeChange = {
  file: string;
  line: number;
  /** Undefined when the report holds no source text (7.11). */
  original: string | undefined;
  /** Undefined when the report holds no replacement. */
  mutated: string | undefined;
  replacement: string | undefined;
};

export type BreadcrumbPart = { label: string; href?: string };

export type SpecimenView = {
  mutant: Mutant;
  /** "Verdict / requirement <n> / <mutant id>"; the requirement part only for a Spec_Mutant (13.15). */
  breadcrumb: BreadcrumbPart[];
  /** Undefined for a not-counted mutant: no creature is drawn (4.8). */
  creatureState: CreatureState | undefined;
  stateLabel: string;
  change: CodeChange;
  /** Present only when the Verdict_File holds the criterion with its text (7.12). */
  criterion: { id: string; text: string } | undefined;
  witness: WitnessView | undefined;
  /** Killed mutants only. */
  killedBy: { tests: TestList; killClass: KillClass | undefined; timedOut: boolean } | undefined;
  /** Survivors that have `coveredBy` entries. */
  coveredBy: TestList | undefined;
  /** True for an in-the-dark mutant (7.7). */
  noTestRuns: boolean;
};

/** Renders any JSON-ish value as text. Never throws. */
export const formatValue = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

const STATE_LABEL: Record<CreatureState | "not-counted", string> = {
  survivor: "survived",
  killed: "killed",
  "in-the-dark": "in the dark",
  ghost: "ghost, not counted",
  "not-counted": "not counted",
};

const limit = (all: readonly string[]): TestList => ({
  names: all.slice(0, MAX_TEST_NAMES),
  hidden: Math.max(0, all.length - MAX_TEST_NAMES),
});

const outcomeView = (outcome: WitnessOutcome): OutcomeView => {
  switch (outcome.kind) {
    case "value":
      return { kind: "value", text: formatValue(outcome.value) };
    case "error":
      return { kind: "error", text: outcome.className };
    case "timeout":
      return { kind: "timeout", text: outcome.message };
    case "no-outcome":
      return { kind: "no-outcome", text: outcome.message };
  }
};

const witnessOf = (run: RunModel, id: string): VerdictWitness | undefined =>
  Object.entries(run.verdict?.witnesses ?? {}).find(([key]) => key === id)?.[1] as
    | VerdictWitness
    | undefined;

const witnessView = (w: VerdictWitness): WitnessView => ({
  input: `${w.export}(${w.args.map(formatValue).join(", ")})`,
  expected:
    "expectedError" in w
      ? { kind: "error", text: w.expectedError }
      : { kind: "value", text: formatValue(w.expected) },
  mutated: w.mutatedOutcome === undefined ? undefined : outcomeView(w.mutatedOutcome),
});

const codeChange = (run: RunModel, m: Mutant): CodeChange => {
  const { start, end } = m.location;
  const base = { file: m.file, line: start.line, replacement: m.replacement };
  const source = run.report.files[m.file]?.source ?? "";
  const lines = source.split(/\r?\n/);
  const first = lines[start.line - 1];
  const last = lines[end.line - 1];
  if (source === "" || first === undefined || last === undefined || end.line < start.line) {
    return { ...base, original: undefined, mutated: undefined };
  }
  return {
    ...base,
    original: lines.slice(start.line - 1, end.line).join("\n"),
    mutated:
      m.replacement === undefined
        ? undefined
        : first.slice(0, start.column - 1) + m.replacement + last.slice(end.column - 1),
  };
};

/** Builds everything the Specimen screen shows for one mutant. Pure. Undefined for an unknown id (7.10). */
export const buildSpecimenView = (run: RunModel, mutantId: string): SpecimenView | undefined => {
  const mutant = run.mutants.find((m) => m.id === mutantId);
  if (mutant === undefined) return undefined;

  const reportMutant = run.report.files[mutant.file]?.mutants.find((m) => m.id === mutantId);
  const coverage =
    mutant.requirement === undefined
      ? undefined
      : run.verdict?.coverage.find((c) => c.criterion === mutant.requirement);
  const witness = witnessOf(run, mutantId);

  const verdictTests = mutant.verdictEntry?.killingTests ?? [];
  const killing: readonly string[] =
    verdictTests.length > 0 ? verdictTests : (reportMutant?.killedBy ?? []);
  const covered = reportMutant?.coveredBy ?? [];

  return {
    mutant,
    breadcrumb: [
      { label: "Verdict", href: "#/verdict" },
      ...(mutant.requirement === undefined ? [] : [{ label: `requirement ${mutant.requirement}` }]),
      { label: mutant.id },
    ],
    creatureState: mutant.state === "not-counted" ? undefined : mutant.state,
    stateLabel: STATE_LABEL[mutant.state],
    change: codeChange(run, mutant),
    criterion:
      mutant.requirement !== undefined && coverage?.text !== undefined && coverage.text !== ""
        ? { id: mutant.requirement, text: coverage.text }
        : undefined,
    witness: witness === undefined ? undefined : witnessView(witness),
    killedBy:
      mutant.state === "killed"
        ? {
            tests: limit(killing),
            killClass: mutant.verdictEntry?.killClass,
            timedOut: mutant.reportStatus === "Timeout",
          }
        : undefined,
    coveredBy: mutant.state === "survivor" && covered.length > 0 ? limit(covered) : undefined,
    noTestRuns: mutant.state === "in-the-dark",
  };
};
