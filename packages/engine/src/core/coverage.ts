import type {
  Criterion,
  CriterionCoverage,
  CriterionId,
  MutantResult,
  SkipEntry,
} from "./types.js";

export type CoverageSummary = {
  /** One entry per criterion, in input order (Requirement 7.8). */
  coverage: CriterionCoverage[];
  /** Headline: surviving Spec_Mutants (Requirement 7.10). */
  survivingSpecMutants: number;
  /** Mechanical_Mutants with no requirement, counted apart from the headline (Requirement 7.9). */
  strays: number;
};

const isValid = (m: MutantResult): boolean =>
  m.status === "Killed" || m.status === "Survived" || m.status === "Timeout";

/**
 * Assigns exactly one Coverage_Status per criterion. Timeout counts as killed. Only Killed,
 * Survived and Timeout mutants are valid. A skip entry applies only to a criterion without a
 * valid Spec_Mutant. Pure.
 */
export const computeCoverage = (
  criteria: readonly Criterion[],
  mutantResults: readonly MutantResult[],
  skipEntries: readonly SkipEntry[],
): CoverageSummary => {
  const validByCriterion = new Map<CriterionId, MutantResult[]>();
  let survivingSpecMutants = 0;
  let strays = 0;
  for (const m of mutantResults) {
    if (m.requirement === undefined) {
      strays++;
      continue;
    }
    if (!isValid(m)) continue;
    if (m.status === "Survived") survivingSpecMutants++;
    const list = validByCriterion.get(m.requirement);
    if (list) list.push(m);
    else validByCriterion.set(m.requirement, [m]);
  }

  const skips = new Map<CriterionId, string>();
  for (const s of skipEntries) if (!skips.has(s.requirement)) skips.set(s.requirement, s.reason);

  const coverage = criteria.map((c): CriterionCoverage => {
    const valid = validByCriterion.get(c.id) ?? [];
    if (valid.some((m) => m.status === "Survived")) return { criterion: c.id, status: "unguarded" };
    if (valid.length > 0) return { criterion: c.id, status: "guarded" };
    const reason = skips.get(c.id);
    if (reason !== undefined) return { criterion: c.id, status: "skipped", reason };
    return { criterion: c.id, status: "unattacked" };
  });

  return { coverage, survivingSpecMutants, strays };
};
