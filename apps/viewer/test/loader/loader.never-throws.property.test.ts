// Feature: bestiary-viewer, Property V8: Loading never crashes
import fc from "fast-check";
import { describe, it } from "vitest";
import { parseFile } from "../../src/loader/parse.js";
import { recognise } from "../../src/loader/recognise.js";
import type { FileKind, LoadError } from "../../src/loader/types.js";

const line = fc.oneof(
  fc.jsonValue().map((v) => JSON.stringify(v)),
  fc.constant(""),
  fc.constant("   "),
  fc.constant("{"),
  fc.string(),
  fc.string({ unit: "binary" }),
);

const text = fc.oneof(
  fc.jsonValue().map((v) => JSON.stringify(v)),
  fc.jsonValue().map((v) => JSON.stringify(v, null, 2)),
  fc.array(line, { maxLength: 8 }).map((ls) => ls.join("\n")),
  fc.array(line, { maxLength: 8 }).map((ls) => `${ls.join("\r\n")}\n`),
  fc.constantFrom("", " ", "\n", "\n\n", " \t\r\n"),
  fc.string({ unit: "binary" }),
);

const isLoadError = (e: unknown): e is LoadError =>
  typeof e === "object" && e !== null && typeof (e as LoadError).message === "string";

describe("V8 loading never crashes", () => {
  it("1.6-1.14 recognise then parseFile return a Result and never throw", () => {
    fc.assert(
      fc.property(text, fc.string(), (content, fileName) => {
        const check = (kind: FileKind) => {
          const parsed = parseFile(kind, content, fileName);
          if (parsed.ok) return;
          if (!isLoadError(parsed.error) || parsed.error.fileName !== fileName) return false;
          if (kind === "history" && parsed.error.line !== undefined) {
            const n = parsed.error.line;
            const lines = content.split("\n");
            if (!Number.isInteger(n) || n < 1 || n > lines.length) return false;
            if ((lines[n - 1] ?? "").trim() === "") return false;
          }
          return true;
        };

        const rec = recognise(content, fileName);
        if (typeof rec.ok !== "boolean") return false;
        if (!rec.ok) {
          if (!isLoadError(rec.error) || rec.error.fileName !== fileName) return false;
        } else if (check(rec.value) === false) {
          return false;
        }
        // Force the history path so line errors are exercised on any text.
        return check("history") !== false;
      }),
    );
  });
});
