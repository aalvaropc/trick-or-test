import type { MutantResult, ReportStatus } from "trick-or-test/report";

export type CreatureState = "survivor" | "killed" | "in-the-dark" | "ghost";

export type StateInput = {
  reportStatus: ReportStatus;
  statusReason?: string | undefined;
  /** Present only when a Verdict_File joined this mutant id. */
  verdictEntry?: Pick<MutantResult, "status"> | undefined;
};

/**
 * Total: maps a mutant's status to a creature state, or "not-counted".
 * The Verdict_File entry status wins when present; otherwise the report status is used.
 * Never throws.
 */
export function deriveState(input: StateInput): CreatureState | "not-counted" {
  const entryStatus: unknown = input?.verdictEntry?.status;
  if (typeof entryStatus === "string") {
    switch (entryStatus) {
      case "Survived":
        return "survivor";
      case "Killed":
      case "Timeout":
        return "killed";
      case "Ghost":
        return "ghost";
      default:
        return "not-counted";
    }
  }
  switch (input?.reportStatus) {
    case "Survived":
      return "survivor";
    case "Killed":
    case "Timeout":
      return "killed";
    case "NoCoverage":
      return "in-the-dark";
    case "Ignored": {
      const reason: unknown = input.statusReason;
      return typeof reason === "string" && /\bGhost\b/.test(reason) ? "ghost" : "not-counted";
    }
    default:
      return "not-counted";
  }
}
