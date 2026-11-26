import { type ChangeEvent, type DragEvent, useState } from "react";
import { LoadErrorView } from "../../app/LoadErrorView.js";
import { useRun } from "../../app/run-context.js";
import { readFiles } from "../../loader/file-reader.js";
import { joinRun } from "../../loader/join-run.js";
import { parseFile } from "../../loader/parse.js";
import { recognise } from "../../loader/recognise.js";
import { buildRunModel } from "../../loader/run-model.js";
import type { LoadError, ParsedFile } from "../../loader/types.js";

/** Loads the files, or returns every error found. Reads in the browser only (1.1). */
const loadFiles = async (
  files: File[],
): Promise<
  { errors: LoadError[] } | { run: ReturnType<typeof buildRunModel>; ignored: number }
> => {
  const errors: LoadError[] = [];
  const parsed: ParsedFile[] = [];
  for (const read of await readFiles(files)) {
    if (!read.ok) {
      errors.push(read.error);
      continue;
    }
    const { fileName, text } = read.value;
    const kind = recognise(text, fileName);
    if (!kind.ok) {
      errors.push(kind.error);
      continue;
    }
    const file = parseFile(kind.value, text, fileName);
    if (file.ok) parsed.push(file.value);
    else errors.push(file.error);
  }
  if (errors.length > 0) return { errors };
  const joined = joinRun(parsed);
  if (!joined.ok) return { errors: [joined.error] };
  return { run: buildRunModel(joined.value), ignored: joined.value.ignoredVerdictEntryCount };
};

/**
 * Drop target and file picker (1.1, 1.2, 3.4, 3.5). On success it sets the Run and opens
 * `#/verdict`. On any error the previous Run stays and the errors are shown (1.7, 1.8, 1.9).
 */
export function DropZone() {
  const { applyLoad } = useRun();
  const [errors, setErrors] = useState<LoadError[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [dragging, setDragging] = useState(false);

  const handle = async (list: FileList | null) => {
    const files = list === null ? [] : Array.from(list);
    if (files.length === 0) return;
    try {
      const outcome = await loadFiles(files);
      if ("errors" in outcome) {
        setErrors(outcome.errors);
        setIgnored(0);
        return;
      }
      setErrors([]);
      setIgnored(outcome.ignored);
      applyLoad({ ok: true, value: outcome.run });
      window.location.hash = "#/verdict";
    } catch {
      setIgnored(0);
      setErrors([{ fileName: "", message: "The files could not be loaded." }]);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void handle(event.dataTransfer.files);
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    void handle(event.target.files);
    event.target.value = "";
  };

  return (
    <section
      className="drop-zone"
      data-dragging={dragging ? "true" : undefined}
      aria-label="Load a run"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <p>Drop a report, a verdict or a history file here.</p>
      <div className="file-picker">
        <label className="button" htmlFor="run-files">
          Choose files
        </label>
        <input
          id="run-files"
          className="visually-hidden"
          type="file"
          multiple
          data-testid="file-input"
          onChange={onPick}
        />
      </div>
      {errors.map((error) => (
        <LoadErrorView
          key={`${error.fileName}|${error.line ?? 0}|${error.message}`}
          error={error}
        />
      ))}
      {ignored > 0 ? (
        <p role="status">
          {ignored === 1 ? "1 verdict entry ignored." : `${ignored} verdict entries ignored.`}
        </p>
      ) : null}
    </section>
  );
}
