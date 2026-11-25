import { z } from "zod";
import { err, ok, type Result } from "./result.js";
import type { Criterion, CriterionId, MutantId, SkipEntry, SpecMutant, Witness } from "./types.js";

export type LoadError = {
  filePath: string;
  field?: string;
  message: string;
};

/** A validated Spec_Mutant together with the mutant file it came from. */
export type LoadedSpecMutant = { filePath: string; mutant: SpecMutant };

/** A validated Skip_File entry together with its position in the Skip_File. */
export type LoadedSkipEntry = { filePath: string; index: number; entry: SkipEntry };

const loadError = (filePath: string, message: string, field?: string): LoadError =>
  field === undefined ? { filePath, message } : { filePath, field, message };

const nonEmpty = z.string().min(1);

const witnessSchema = z.strictObject({
  from: nonEmpty.optional(),
  export: nonEmpty,
  args: z.array(z.unknown()),
  expected: z.unknown().optional(),
  expectedError: nonEmpty.optional(),
});

const specMutantSchema = z.strictObject({
  id: nonEmpty,
  requirement: nonEmpty,
  file: nonEmpty,
  original: nonEmpty,
  mutated: nonEmpty,
  why: nonEmpty,
  witness: witnessSchema,
});

const skipFileSchema = z.array(
  z.strictObject({
    requirement: nonEmpty,
    reason: z.string(),
  }),
);

type Parsed = { ok: true; value: unknown } | { ok: false };

/** A string is raw file text and is parsed as JSON; any other value is taken as already parsed. */
const parseJson = (raw: unknown): Parsed => {
  if (typeof raw !== "string") return { ok: true, value: raw };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
};

const firstIssue = (filePath: string, issues: readonly z.core.$ZodIssue[]): LoadError => {
  const issue = issues[0];
  if (issue === undefined) return loadError(filePath, "is invalid");
  if (issue.code === "unrecognized_keys") {
    const key = issue.keys[0] ?? "";
    const prefix = issue.path.length > 0 ? `${issue.path.join(".")}.` : "";
    return loadError(filePath, `has an unknown field "${prefix}${key}"`, `${prefix}${key}`);
  }
  const field = issue.path.length > 0 ? issue.path.join(".") : undefined;
  return loadError(
    filePath,
    field === undefined
      ? `is invalid: ${issue.message}`
      : `has an invalid field "${field}": ${issue.message}`,
    field,
  );
};

/**
 * Validates one mutant file (Requirements 4.1-4.4).
 * Exactly one of `expected` and `expectedError` must be present; `from` defaults to `file`.
 */
export function validateSpecMutant(raw: unknown, filePath: string): Result<SpecMutant, LoadError> {
  const json = parseJson(raw);
  if (!json.ok) return err(loadError(filePath, "is not valid JSON"));

  const parsed = specMutantSchema.safeParse(json.value);
  if (!parsed.success) return err(firstIssue(filePath, parsed.error.issues));

  const data = parsed.data;
  const w = data.witness;
  const hasExpected = Object.hasOwn(w, "expected");
  const hasError = w.expectedError !== undefined;
  if (hasExpected === hasError) {
    return err(
      loadError(
        filePath,
        hasExpected
          ? 'has a witness with both "expected" and "expectedError"; exactly one is allowed'
          : 'has a witness with neither "expected" nor "expectedError"; exactly one is required',
        "witness",
      ),
    );
  }

  const from = w.from ?? data.file;
  const witness: Witness = hasError
    ? { from, export: w.export, args: w.args, expectedError: w.expectedError as string }
    : { from, export: w.export, args: w.args, expected: w.expected };

  return ok({
    id: data.id as MutantId,
    requirement: data.requirement as CriterionId,
    file: data.file,
    original: data.original,
    mutated: data.mutated,
    why: data.why,
    witness,
  });
}

/** Validates the Skip_File: a list of `{ requirement, reason }` entries (Requirements 4.7, 4.8). */
export function validateSkipFile(raw: unknown, filePath: string): Result<SkipEntry[], LoadError> {
  const json = parseJson(raw);
  if (!json.ok) return err(loadError(filePath, "is not valid JSON"));

  const parsed = skipFileSchema.safeParse(json.value);
  if (!parsed.success) return err(firstIssue(filePath, parsed.error.issues));

  const entries: SkipEntry[] = [];
  for (const [index, item] of parsed.data.entries()) {
    if (item.reason.trim() === "") {
      return err(
        loadError(
          filePath,
          `entry ${index} ("${item.requirement}") has an empty reason`,
          `${index}.reason`,
        ),
      );
    }
    entries.push({ requirement: item.requirement as CriterionId, reason: item.reason });
  }
  return ok(entries);
}

/**
 * Validates every mutant file independently. A bad file yields an error and the
 * other files still load. Mutants are ordered by id (Requirements 4.4, 4.10).
 */
export function loadSpecMutants(files: readonly { filePath: string; raw: unknown }[]): {
  mutants: LoadedSpecMutant[];
  errors: LoadError[];
} {
  const mutants: LoadedSpecMutant[] = [];
  const errors: LoadError[] = [];
  for (const { filePath, raw } of files) {
    const result = validateSpecMutant(raw, filePath);
    if (result.ok) mutants.push({ filePath, mutant: result.value });
    else errors.push(result.error);
  }
  mutants.sort((a, b) => (a.mutant.id < b.mutant.id ? -1 : a.mutant.id > b.mutant.id ? 1 : 0));
  return { mutants, errors };
}

/**
 * Cross-file rules (Requirements 4.5, 4.6, 4.8, 4.9): duplicate id naming both files,
 * unknown requirement, empty skip reason, and skip entries for an unknown criterion or
 * a criterion that has a mutant.
 */
export function checkCrossFileRules(
  mutants: readonly LoadedSpecMutant[],
  skipEntries: readonly LoadedSkipEntry[],
  criteria: readonly Criterion[],
): LoadError[] {
  const errors: LoadError[] = [];
  const known = new Set<string>(criteria.map((c) => c.id));

  const firstFileById = new Map<string, string>();
  for (const { filePath, mutant } of mutants) {
    const first = firstFileById.get(mutant.id);
    if (first === undefined) {
      firstFileById.set(mutant.id, filePath);
    } else {
      errors.push(
        loadError(
          filePath,
          `has the id "${mutant.id}", which is already used by ${first} (${first} and ${filePath})`,
          "id",
        ),
      );
    }
    if (!known.has(mutant.requirement)) {
      errors.push(
        loadError(
          filePath,
          `names requirement "${mutant.requirement}", which is not a criterion of requirements.md`,
          "requirement",
        ),
      );
    }
  }

  const attacked = new Set<string>(mutants.map((m) => m.mutant.requirement));
  for (const { filePath, index, entry } of skipEntries) {
    const name = `entry ${index} ("${entry.requirement}")`;
    if (entry.reason.trim() === "") {
      errors.push(loadError(filePath, `${name} has an empty reason`, `${index}.reason`));
    }
    if (!known.has(entry.requirement)) {
      errors.push(
        loadError(
          filePath,
          `${name} names a criterion that does not exist`,
          `${index}.requirement`,
        ),
      );
    } else if (attacked.has(entry.requirement)) {
      errors.push(
        loadError(
          filePath,
          `${name} names a criterion that also has a Spec_Mutant`,
          `${index}.requirement`,
        ),
      );
    }
  }
  return errors;
}
