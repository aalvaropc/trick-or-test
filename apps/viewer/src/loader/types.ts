export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type LoadError = {
  fileName: string;
  message: string;
  /** 1-based, History_File errors only; counts blank lines. */
  line?: number;
  fieldPaths?: string[];
  truncatedCount?: number;
};

export type FileKind = "mutation-report" | "verdict" | "history" | "unknown";
