import { joinRun } from "./join-run.js";
import { parseFile } from "./parse.js";
import { recognise } from "./recognise.js";
import type { FileKind, LoadError, ParsedFile, RawRun, Result } from "./types.js";

export const FETCH_TIMEOUT_MS = 10_000;

/** The files of one Demo_Run, with the kind each one must have. */
const DEMO_FILES: { name: string; kind: FileKind }[] = [
  { name: "report.json", kind: "mutation-report" },
  { name: "verdict.json", kind: "verdict" },
  { name: "history.jsonl", kind: "history" },
];

const fetchText = async (url: string, fileName: string): Promise<Result<string, LoadError>> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    if (!response.ok) {
      return {
        ok: false,
        error: {
          fileName,
          message: `${fileName} could not be fetched (HTTP ${response.status}).`,
        },
      };
    }
    return { ok: true, value: await response.text() };
  } catch {
    const message = controller.signal.aborted
      ? `${fileName} could not be fetched: no response within 10 seconds.`
      : `${fileName} could not be fetched: network failure.`;
    return { ok: false, error: { fileName, message } };
  } finally {
    clearTimeout(timer);
  }
};

const invalid = (fileName: string, detail?: string): { ok: false; error: LoadError } => ({
  ok: false,
  error: {
    fileName,
    message: `${fileName} has invalid content.${detail ? ` ${detail}` : ""}`,
  },
});

/**
 * Fetches one Demo_Run (GET only) from `<baseUrl>demo/<which>/` and joins it like local files.
 * Never throws; every failure is a LoadError that names the file.
 */
export const fetchDemoRun = async (
  which: "before" | "after",
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<Result<RawRun, LoadError>> => {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const parsed: ParsedFile[] = [];
  for (const { name, kind } of DEMO_FILES) {
    const fileName = `demo/${which}/${name}`;
    const fetched = await fetchText(`${base}demo/${which}/${name}`, fileName);
    if (!fetched.ok) return fetched;

    const recognised = recognise(fetched.value, fileName);
    if (!recognised.ok) return invalid(fileName, recognised.error.message);
    if (recognised.value !== kind) return invalid(fileName);

    const file = parseFile(kind, fetched.value, fileName);
    if (!file.ok) return invalid(fileName, file.error.message);
    parsed.push(file.value);
  }
  return joinRun(parsed);
};
