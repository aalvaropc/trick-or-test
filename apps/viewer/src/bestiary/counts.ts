import type { KillClass, Species } from "trick-or-test/report";
import type { Mutant, RunModel } from "../loader/run-model.js";
import { SPECIES_TABLE } from "./species.js";

/** Not-counted Mutants are excluded from every count (Requirement 4.8, 4.11). */
const counted = (model: RunModel): Mutant[] =>
  model.mutants.filter((m) => m.state !== "not-counted");

export type HeadlineCounts = {
  survivingSpecMutants: number;
  killedSpecMutants: number;
  /** Undefined when the Run has no Verdict_File (no coverage list). */
  guardedCriteria: number | undefined;
  unguardedCriteria: number | undefined;
};

export function computeHeadlineCounts(model: RunModel): HeadlineCounts {
  let survivingSpecMutants = 0;
  let killedSpecMutants = 0;
  for (const m of counted(model)) {
    if (m.requirement === undefined) continue;
    if (m.state === "survivor") survivingSpecMutants += 1;
    else if (m.state === "killed") killedSpecMutants += 1;
  }
  if (model.verdict === undefined) {
    return {
      survivingSpecMutants,
      killedSpecMutants,
      guardedCriteria: undefined,
      unguardedCriteria: undefined,
    };
  }
  let guardedCriteria = 0;
  let unguardedCriteria = 0;
  for (const c of model.verdict.coverage) {
    if (c.status === "guarded") guardedCriteria += 1;
    else if (c.status === "unguarded") unguardedCriteria += 1;
  }
  return { survivingSpecMutants, killedSpecMutants, guardedCriteria, unguardedCriteria };
}

export type StateCounts = {
  survivor: number;
  killed: number;
  "in-the-dark": number;
  ghost: number;
  "not-counted": number;
};

/** Number of Mutants in each state. Not-counted Mutants are reported apart, never in the others. */
export function computeStateCounts(model: RunModel): StateCounts {
  const result: StateCounts = {
    survivor: 0,
    killed: 0,
    "in-the-dark": 0,
    ghost: 0,
    "not-counted": 0,
  };
  for (const m of model.mutants) result[m.state] += 1;
  return result;
}

export type KillClassCounts = Record<KillClass, number>;

/** Counts killed Mutants per Kill_Class. All four groups are present, 0 when empty. */
export function computeKillClassCounts(model: RunModel): KillClassCounts {
  const result: KillClassCounts = {
    "examples-only": 0,
    "properties-only": 0,
    both: 0,
    unattributed: 0,
  };
  for (const m of counted(model)) {
    const killClass = m.verdictEntry?.killClass;
    if (m.state === "killed" && killClass !== undefined && killClass in result) {
      result[killClass] += 1;
    }
  }
  return result;
}

export type SpeciesLegendEntry = {
  species: Species;
  bodyDescription: string;
  mutationType: string;
  count: number;
};

const LEGEND_TEXT: Record<Species, { body: string; type: string }> = {
  Borderling: {
    body: "Thin, stretched along a horizontal boundary line, one limb across it",
    type: "Equality operator changed",
  },
  Miscount: {
    body: "Lopsided: a different number of limbs or eyes on each side",
    type: "Arithmetic, update, unary or assignment operator changed",
  },
  "Two-Face": {
    body: "Two faces looking opposite ways",
    type: "Condition, logical operator or boolean changed",
  },
  Hollow: {
    body: "An outline with an empty ribcage",
    type: "Block, array, object, string or arrow function emptied",
  },
  Impostor: {
    body: "A body holding a mask slightly off its face",
    type: "Method call, regular expression or optional chain swapped",
  },
  Oathbreaker: {
    body: "Carries a torn scroll",
    type: "Change that breaks an acceptance criterion",
  },
  Unclassified: {
    body: "Plain shape with a dotted outline",
    type: "Other mutation",
  },
};

const LEGEND_ORDER: readonly Species[] = [
  ...SPECIES_TABLE.map((row) => row.species),
  "Unclassified",
];

/** One entry per Species present in the Run, in table order. Species with 0 Mutants are omitted. */
export function computeSpeciesLegend(model: RunModel): SpeciesLegendEntry[] {
  const tally = new Map<Species, number>();
  for (const m of counted(model)) tally.set(m.species, (tally.get(m.species) ?? 0) + 1);
  const entries: SpeciesLegendEntry[] = [];
  for (const species of LEGEND_ORDER) {
    const count = tally.get(species) ?? 0;
    if (count === 0) continue;
    entries.push({
      species,
      bodyDescription: LEGEND_TEXT[species].body,
      mutationType: LEGEND_TEXT[species].type,
      count,
    });
  }
  return entries;
}

export const STRAY_LIMIT = 60;

const STATE_RANK: Record<string, number> = {
  survivor: 0,
  "in-the-dark": 1,
  killed: 2,
  ghost: 3,
};

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export type StraySelection = {
  shown: Mutant[];
  remaining: number;
};

/** Strays are counted Mutants without a requirement id, ordered by status, file, then line. */
export function selectStrays(model: RunModel, limit: number = STRAY_LIMIT): StraySelection {
  const strays = counted(model).filter((m) => m.requirement === undefined);
  strays.sort(
    (a, b) =>
      (STATE_RANK[a.state] ?? 99) - (STATE_RANK[b.state] ?? 99) ||
      compareText(a.file, b.file) ||
      a.location.start.line - b.location.start.line,
  );
  return {
    shown: strays.slice(0, limit),
    remaining: Math.max(0, strays.length - limit),
  };
}
