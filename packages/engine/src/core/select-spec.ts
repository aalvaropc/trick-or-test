import { err, ok, type Result } from "./result.js";

/** Why no single spec could be chosen. The CLI prints the message to stderr (9.5, 9.16). */
export interface SpecSelectionError {
  readonly message: string;
}

const fail = (message: string): Result<never, SpecSelectionError> => err({ message });

/**
 * Chooses the one spec a run attacks (Requirements 9.5, 9.16). `specNames` lists the spec
 * directories that contain a `requirements.md`; the shell supplies it.
 */
export function selectSpec(
  specNames: readonly string[],
  requested?: string,
): Result<string, SpecSelectionError> {
  if (specNames.length === 0) return fail("no spec found: no spec directory has a requirements.md");
  const sorted = [...specNames].sort();
  const available = sorted.join(", ");

  if (requested !== undefined) {
    if (sorted.includes(requested)) return ok(requested);
    return fail(
      `--spec ${requested} is not a spec with a requirements.md. Available: ${available}`,
    );
  }
  if (sorted.length === 1) return ok(sorted[0] as string);
  return fail(`Several specs found: ${available}. Choose one with --spec <name>`);
}
