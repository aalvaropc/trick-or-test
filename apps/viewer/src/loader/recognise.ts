import { historyRecordSchema, mutationReportSchema, verdictSchema } from "trick-or-test/report";
import type { FileKind, LoadError, Result } from "./types.js";

type Parsed = { ok: true; value: unknown } | { ok: false; message: string };

const tryParse = (text: string): Parsed => {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * Classifies a file from its content, never from its name.
 * Precedence: whole-document Mutation_Report or Verdict_File, then JSON Lines history,
 * then an empty or invalid-JSON error. Valid JSON of another shape gives "unknown".
 */
export const recognise = (text: string, fileName = ""): Result<FileKind, LoadError> => {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { ok: false, error: { fileName, message: "The file is empty." } };
  }

  const whole = tryParse(text);
  if (whole.ok) {
    if (mutationReportSchema.safeParse(whole.value).success) {
      return { ok: true, value: "mutation-report" };
    }
    if (verdictSchema.safeParse(whole.value).success) return { ok: true, value: "verdict" };
  }

  // JSON Lines: "\r" before "\n" is whitespace, so JSON.parse ignores it.
  let allLinesJson = true;
  for (const line of lines) {
    const parsed = tryParse(line);
    if (!parsed.ok) {
      allLinesJson = false;
      continue;
    }
    if (historyRecordSchema.safeParse(parsed.value).success) {
      return { ok: true, value: "history" };
    }
  }

  if (whole.ok || allLinesJson) return { ok: true, value: "unknown" };
  return {
    ok: false,
    error: { fileName, message: `The file is not valid JSON: ${whole.message}` },
  };
};
