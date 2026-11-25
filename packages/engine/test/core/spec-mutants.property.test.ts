// Property 18: Spec mutant path safety. Validates: Requirements 4.3, 4.11, 4.12
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateSpecMutant } from "../../src/core/spec-mutants.js";

const MUTANT_FILE = "mutants/cart-pricing/oath-4.3-x.json";

// Safe path segments: never "..", never empty, no separator. "a..b" and Unicode are allowed.
const safeSegment = fc.oneof(
  fc.stringMatching(/^[a-z0-9_-]{1,8}$/),
  fc.constantFrom("a..b", "módulo", "日本", "file name", "x.ts", ".hidden", "~tilde"),
);
const safePath = fc
  .tuple(safeSegment, fc.array(safeSegment, { maxLength: 3 }))
  .map(([first, rest]) => [first, ...rest].join("/"))
  // A leading "~" is unsafe, so keep only paths that do not start with one.
  .filter((p) => !p.startsWith("~"));

const unsafePath: fc.Arbitrary<string> = fc.oneof(
  // absolute, drive letter, UNC, home
  safePath.map((p) => `/${p}`),
  safePath.map((p) => `//server/share/${p}`),
  fc.tuple(fc.constantFrom("C", "d", "Z"), safePath).map(([d, p]) => `${d}:/${p}`),
  fc.tuple(fc.constantFrom("C", "d"), safePath).map(([d, p]) => `${d}:${p}`),
  safePath.map((p) => `~/${p}`),
  fc.constant("~"),
  // ".." at the start, in the middle, at the end, or alone
  safePath.map((p) => `../${p}`),
  fc.tuple(safePath, safePath).map(([a, b]) => `${a}/../${b}`),
  safePath.map((p) => `${p}/..`),
  fc.constant(".."),
  // backslash and NUL anywhere
  fc.tuple(safePath, safePath).map(([a, b]) => `${a}\\${b}`),
  safePath.map((p) => `\\${p}`),
  fc.tuple(safePath, safePath).map(([a, b]) => `${a}\0${b}`),
  safePath.map((p) => `${p}\0`),
);

const idChunk = fc.stringMatching(/^[A-Za-z0-9_-]{1,6}$/);
const safeId = fc
  .tuple(idChunk, fc.array(idChunk, { maxLength: 3 }))
  .map(([first, rest]) => [first, ...rest].join("."));
const unsafeId: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(idChunk, idChunk).map(([a, b]) => `${a}/${b}`),
  fc.tuple(idChunk, idChunk).map(([a, b]) => `${a}\\${b}`),
  fc.tuple(idChunk, idChunk).map(([a, b]) => `${a} ${b}`),
  fc.tuple(idChunk, idChunk).map(([a, b]) => `${a}..${b}`),
  idChunk.map((a) => `..${a}`),
  idChunk.map((a) => `${a}..`),
  fc.constant(".."),
  fc.tuple(idChunk, fc.constantFrom("é", "ñ", "日", "👻", "\0", "\n")).map(([a, c]) => `${a}${c}`),
  idChunk.map((a) => `../${a}`),
);

type Field = "id" | "file" | "witness.from";

type Candidate<T> = { value: T; safe: boolean };
const tagged = (safe: fc.Arbitrary<string>, unsafe: fc.Arbitrary<string>) =>
  fc.oneof(
    { weight: 2, arbitrary: safe.map((value): Candidate<string> => ({ value, safe: true })) },
    { weight: 3, arbitrary: unsafe.map((value): Candidate<string> => ({ value, safe: false })) },
  );

const build = (id: string, file: string, from: string | undefined) => ({
  id,
  requirement: "4.3",
  file,
  original: "a",
  mutated: "b",
  why: "w",
  witness: {
    ...(from === undefined ? {} : { from }),
    export: "f",
    args: [],
    expected: 1,
  },
});

describe("Property 18: Spec mutant path safety", () => {
  it("4.11 accepts a mutant exactly when id, file and the effective witness.from are safe, and names the first offending field", () => {
    fc.assert(
      fc.property(
        tagged(safeId, unsafeId),
        tagged(safePath, unsafePath),
        fc.option(tagged(safePath, unsafePath), { nil: undefined }),
        (id, file, from) => {
          const result = validateSpecMutant(build(id.value, file.value, from?.value), MUTANT_FILE);
          const effectiveFromSafe = from === undefined ? file.safe : from.safe;
          const firstBad: Field | undefined = !id.safe
            ? "id"
            : !file.safe
              ? "file"
              : !effectiveFromSafe
                ? "witness.from"
                : undefined;
          if (firstBad === undefined) {
            expect(result.ok).toBe(true);
          } else {
            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.error.filePath).toBe(MUTANT_FILE);
              expect(result.error.field).toBe(firstBad);
              expect(result.error.message.length).toBeGreaterThan(0);
            }
          }
        },
      ),
    );
  });

  it("4.3 a missing witness.from defaults to file, and an explicit safe from is kept", () => {
    fc.assert(
      fc.property(safeId, safePath, fc.option(safePath, { nil: undefined }), (id, file, from) => {
        const result = validateSpecMutant(build(id, file, from), MUTANT_FILE);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.id).toBe(id);
          expect(result.value.file).toBe(file);
          expect(result.value.witness.from).toBe(from ?? file);
        }
      }),
    );
  });

  it("4.3 an unsafe file is rejected as file even when witness.from is omitted", () => {
    fc.assert(
      fc.property(safeId, unsafePath, (id, file) => {
        const result = validateSpecMutant(build(id, file, undefined), MUTANT_FILE);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.filePath).toBe(MUTANT_FILE);
          expect(result.error.field).toBe("file");
        }
      }),
    );
  });

  it("4.11 an empty file or an empty witness.from is rejected and names its field", () => {
    fc.assert(
      fc.property(safeId, safePath, fc.boolean(), (id, path, emptyFile) => {
        const raw = emptyFile ? build(id, "", path) : build(id, path, "");
        const result = validateSpecMutant(raw, MUTANT_FILE);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.filePath).toBe(MUTANT_FILE);
          expect(result.error.field).toBe(emptyFile ? "file" : "witness.from");
        }
      }),
    );
  });

  it("4.12 an unsafe id is rejected as id whatever the paths are", () => {
    fc.assert(
      fc.property(unsafeId, safePath, (id, file) => {
        const result = validateSpecMutant(build(id, file, undefined), MUTANT_FILE);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.filePath).toBe(MUTANT_FILE);
          expect(result.error.field).toBe("id");
        }
      }),
    );
  });
});
