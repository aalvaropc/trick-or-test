import type { Mutant, RunModel } from "../loader/run-model.js";

export type SealEntry = (
  | { criterion: string; status: "guarded" }
  | { criterion: string; status: "unguarded"; survivors: Mutant[] }
  | { criterion: string; status: "unattacked" }
  | { criterion: string; status: "skipped"; reason: string }
  | { criterion: string; status: "unrecognised"; rawStatus: string }
) & {
  /** Criterion text, present only when the Verdict_File holds it (13.12). */
  text?: string;
};

/**
 * One entry per coverage list entry (Requirements 6.2 to 6.7, 6.16).
 * A Criterion with a surviving Spec_Mutant is never reported as guarded.
 * Total: never throws.
 */
export function computeCoverageView(model: RunModel): SealEntry[] {
  const coverage: unknown = model.verdict?.coverage;
  if (!Array.isArray(coverage)) return [];

  const survivorsByCriterion = new Map<string, Mutant[]>();
  for (const m of model.mutants) {
    if (m.requirement === undefined || m.state !== "survivor") continue;
    const list = survivorsByCriterion.get(m.requirement);
    if (list === undefined) survivorsByCriterion.set(m.requirement, [m]);
    else list.push(m);
  }

  return coverage.map((raw: unknown): SealEntry => {
    const entry = (typeof raw === "object" && raw !== null ? raw : {}) as {
      criterion?: unknown;
      status?: unknown;
      reason?: unknown;
      text?: unknown;
    };
    const base = sealOf(entry, survivorsByCriterion);
    return typeof entry.text === "string" && entry.text !== ""
      ? { ...base, text: entry.text }
      : base;
  });
}

function sealOf(
  entry: { criterion?: unknown; status?: unknown; reason?: unknown },
  survivorsByCriterion: Map<string, Mutant[]>,
): SealEntry {
  const criterion = String(entry.criterion);
  const survivors = survivorsByCriterion.get(criterion) ?? [];
  switch (entry.status) {
    case "guarded":
    case "unguarded":
      return survivors.length > 0 || entry.status === "unguarded"
        ? { criterion, status: "unguarded", survivors }
        : { criterion, status: "guarded" };
    case "unattacked":
      return { criterion, status: "unattacked" };
    case "skipped":
      return {
        criterion,
        status: "skipped",
        reason: typeof entry.reason === "string" ? entry.reason : "",
      };
    default:
      return { criterion, status: "unrecognised", rawStatus: String(entry.status) };
  }
}
