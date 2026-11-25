import {
  type HistoryRecord,
  historyRecordSchema,
  mutationReportSchema,
  verdictSchema,
} from "trick-or-test/report";
import type { FileKind, LoadError, ParsedFile, Result } from "./types.js";

const MAX_PATHS = 10;

type Issue = { path: PropertyKey[] };

const formatPath = (path: PropertyKey[]): string =>
  path.length === 0 ? "(root)" : path.map(String).join(".");

/** Up to 10 distinct failing field paths, and the count of further ones. */
const summarise = (issues: Issue[]): { fieldPaths: string[]; truncatedCount?: number } => {
  const all = [...new Set(issues.map((i) => formatPath(i.path)))];
  const fieldPaths = all.slice(0, MAX_PATHS);
  const rest = all.length - fieldPaths.length;
  return rest > 0 ? { fieldPaths, truncatedCount: rest } : { fieldPaths };
};

const schemaError = (fileName: string, issues: Issue[], extra: Partial<LoadError> = {}) => {
  const { fieldPaths, truncatedCount } = summarise(issues);
  const more = truncatedCount ? ` and ${truncatedCount} more` : "";
  const error: LoadError = {
    fileName,
    message: `${fileName} does not match the expected format. Failing fields: ${fieldPaths.join(", ")}${more}.`,
    ...extra,
    fieldPaths,
    ...(truncatedCount ? { truncatedCount } : {}),
  };
  return error;
};

const tryJson = (text: string): { ok: true; value: unknown } | { ok: false; message: string } => {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
};

const parseHistory = (text: string, fileName: string): Result<ParsedFile, LoadError> => {
  const records: HistoryRecord[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    const lineNo = i + 1;
    const json = tryJson(line);
    if (!json.ok) {
      return {
        ok: false,
        error: {
          fileName,
          line: lineNo,
          message: `${fileName}, line ${lineNo}: not valid JSON: ${json.message}`,
        },
      };
    }
    const parsed = historyRecordSchema.safeParse(json.value);
    if (!parsed.success) {
      const error = schemaError(fileName, parsed.error.issues, { line: lineNo });
      error.message = `${fileName}, line ${lineNo}: ${error.message}`;
      return { ok: false, error };
    }
    records.push(parsed.data);
  }
  if (records.length === 0) {
    return { ok: false, error: { fileName, message: "The file is empty." } };
  }
  return { ok: true, value: { kind: "history", fileName, records } };
};

/** Validates text of a recognised kind. Uses only `safeParse` and never throws. */
export const parseFile = (
  kind: FileKind,
  text: string,
  fileName: string,
): Result<ParsedFile, LoadError> => {
  if (kind === "unknown") {
    return {
      ok: false,
      error: { fileName, message: `${fileName} is not a Trick or Test file.` },
    };
  }
  if (kind === "history") return parseHistory(text, fileName);

  const json = tryJson(text);
  if (!json.ok) {
    return {
      ok: false,
      error: { fileName, message: `${fileName} is not valid JSON: ${json.message}` },
    };
  }
  if (kind === "mutation-report") {
    const parsed = mutationReportSchema.safeParse(json.value);
    if (!parsed.success) return { ok: false, error: schemaError(fileName, parsed.error.issues) };
    return { ok: true, value: { kind, fileName, report: parsed.data } };
  }
  const parsed = verdictSchema.safeParse(json.value);
  if (!parsed.success) return { ok: false, error: schemaError(fileName, parsed.error.issues) };
  return { ok: true, value: { kind, fileName, verdict: parsed.data } };
};
