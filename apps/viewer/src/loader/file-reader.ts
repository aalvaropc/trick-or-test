import type { LoadError, Result } from "./types.js";

export const MAX_FILE_BYTES = 52_428_800;

export type FileText = { fileName: string; text: string };

const readOne = async (file: File): Promise<Result<FileText, LoadError>> => {
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: {
        fileName: file.name,
        message: `${file.name} is larger than the 50 MB limit and was not read.`,
      },
    };
  }
  try {
    return { ok: true, value: { fileName: file.name, text: await file.text() } };
  } catch {
    return {
      ok: false,
      error: { fileName: file.name, message: `${file.name} could not be read.` },
    };
  }
};

/** Reads each file as text in the browser. One result per file, in input order; never throws. */
export const readFiles = (files: File[]): Promise<Result<FileText, LoadError>[]> =>
  Promise.all(files.map(readOne));
