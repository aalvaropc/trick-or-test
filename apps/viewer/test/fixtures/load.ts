import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Reads a fixture file as text. Node only: tests run in Node. */
export const readFixture = (name: string): string => readFileSync(join(here, name), "utf8");

/**
 * The CRLF history variant. The file editing tools cannot write a carriage return, so this
 * derives it from `history.jsonl`: every LF becomes CRLF.
 */
export const historyCrlf = (): string => readFixture("history.jsonl").replace(/\r?\n/g, "\r\n");
