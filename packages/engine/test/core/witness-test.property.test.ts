// Property 35: Witness test source. Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CriterionId, Witness } from "../../src/core/types.js";
import { buildWitnessTest } from "../../src/core/witness-test.js";

type ProtoMode = "none" | "top" | "deep";

const protoMode = fc.constantFrom<ProtoMode>("none", "top", "deep");

const text = fc.oneof(
  fc.string({ unit: "binary", maxLength: 10 }),
  fc.constantFrom(
    "",
    'q"uote',
    "back\\slash",
    "new\nline",
    "</script>",
    "h\u00e9llo \u2603 \u{1F600}",
    "\u2028\u2029",
    "__proto__",
  ),
);

const key = fc.oneof(text, fc.constantFrom("a", "b", "")).filter((k) => k !== "__proto__");

const number = fc.oneof(
  fc.integer(),
  fc.constantFrom(0, 1, -1, 10000, 0.5, 1e21),
  fc.double({ noNaN: true, noDefaultInfinity: true }).map((n) => (Object.is(n, -0) ? 0 : n)),
);

/** Any JSON value, with no `__proto__` key at any depth. */
const jsonValue: fc.Arbitrary<unknown> = fc.letrec<{ value: unknown }>((tie) => ({
  value: fc.oneof(
    { maxDepth: 4, depthSize: "small" },
    fc.constant(null),
    fc.boolean(),
    number,
    text,
    fc.array(tie("value"), { maxLength: 4 }),
    fc.array(fc.tuple(key, tie("value")), { maxLength: 4 }).map((e) => Object.fromEntries(e)),
  ),
})).value;

const protoObject = (value: unknown): unknown =>
  Object.fromEntries([
    ["a", 1],
    ["__proto__", value],
    ["z", null],
  ]);

/** Wraps `value` so a `__proto__` key sits at the top level or at depth. */
const inject = (value: unknown, mode: ProtoMode): unknown => {
  if (mode === "none") return value;
  if (mode === "top") return protoObject(value);
  return [{ k: [protoObject(value)] }];
};

const hasProto = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasProto);
  if (typeof value === "object" && value !== null) {
    return Object.hasOwn(value, "__proto__") || Object.values(value).some(hasProto);
  }
  return false;
};

const identifier = fc
  .stringMatching(/^[A-Za-z_$][A-Za-z0-9_$]{0,8}$/)
  .filter((name) => !/toEqual|toThrow|JSON|expect/.test(name));

const segment = fc.constantFrom("a", "b", "c");
const dirs = fc.array(segment, { maxLength: 4 });
const testFile = fc
  .tuple(dirs, fc.constantFrom("w", "x"))
  .map(([d, name]) => [...d, `${name}.test.ts`].join("/"));
const from = fc
  .tuple(dirs, fc.constantFrom("index", "m"), fc.constantFrom(".ts", ".tsx"))
  .map(([d, name, ext]) => [...d, `${name}${ext}`].join("/"));

const criterion = fc
  .tuple(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 30 }))
  .map(([r, c]) => `${r}.${c}` as CriterionId);

type Case = {
  witness: Witness;
  criterion: CriterionId;
  testFile: string;
  argsHasProto: boolean;
  expectedHasProto: boolean;
};

const witnessCase = (withError: boolean): fc.Arbitrary<Case> =>
  fc
    .record({
      from,
      export: identifier,
      errorClass: identifier,
      args: fc.array(jsonValue, { maxLength: 3 }),
      argsMode: protoMode,
      expected: jsonValue,
      expectedMode: protoMode,
      criterion,
      testFile,
    })
    .map((r) => {
      const args = r.argsMode === "none" ? r.args : [inject(r.args, r.argsMode), ...r.args];
      // For "top" the first argument itself holds the key; for "deep" it is nested in it.
      const expected = inject(r.expected, withError ? "none" : r.expectedMode);
      const base = { from: r.from, export: r.export, args };
      const witness: Witness = withError
        ? { ...base, expectedError: r.errorClass }
        : { ...base, expected };
      return {
        witness,
        criterion: r.criterion,
        testFile: r.testFile,
        argsHasProto: hasProto(args),
        expectedHasProto: !withError && hasProto(expected),
      };
    });

const anyCase = fc.boolean().chain(witnessCase);

const build = (c: Case): string => {
  const result = buildWitnessTest({
    witness: c.witness,
    criterion: c.criterion,
    testFile: c.testFile,
  });
  if (!result.ok) throw new Error(`unexpected error: ${result.error.message}`);
  return result.value;
};

const between = (source: string, start: string, end: string): string => {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to).toBeGreaterThanOrEqual(0);
  return source.slice(from + start.length, to);
};

/** Parses a printed value back, in whichever of the two forms of Requirement 12.6 it uses. */
const readBack = (printed: string, expectProto: boolean): unknown => {
  if (expectProto) {
    expect(printed.startsWith("JSON.parse(")).toBe(true);
    expect(printed.endsWith(")")).toBe(true);
    const literal: unknown = JSON.parse(printed.slice("JSON.parse(".length, -1));
    expect(typeof literal).toBe("string");
    return JSON.parse(literal as string);
  }
  expect(printed.startsWith("JSON.parse(")).toBe(false);
  return JSON.parse(printed.split("\n  ").join("\n"));
};

const argsText = (source: string, name: string): string =>
  between(source, "const args = ", ` as unknown as Parameters<typeof ${name}>;`);

const expectedText = (source: string): string =>
  between(source, "const expected: unknown = ", ";\n  expect(");

/** Resolves `specifier` from the directory of `file`, on `/`-separated strings. */
const resolveFrom = (file: string, specifier: string): string => {
  const out = file.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") out.pop();
    else if (part !== ".") out.push(part);
  }
  return out.join("/");
};

describe("Property 35: Witness test source", () => {
  it("12.1 two calls with equal input return equal strings", () => {
    fc.assert(
      fc.property(anyCase, (c) => {
        expect(build(c)).toBe(build({ ...c, witness: structuredCloneWitness(c.witness) }));
      }),
    );
  });

  it("12.2 the output names the export and the criterion, and matches the kind of witness", () => {
    fc.assert(
      fc.property(anyCase, (c) => {
        const source = build(c);
        expect(source).toContain(c.witness.export);
        expect(source).toContain(`it(${JSON.stringify(`${c.criterion} `).slice(0, -1)}`);
        if ("expectedError" in c.witness) {
          expect(source).toContain(c.witness.expectedError);
          expect(source).toContain("toThrow");
          expect(source).not.toContain("toEqual");
        } else {
          expect(source).toContain("toEqual");
          expect(source).not.toContain("toThrow");
        }
      }),
    );
  });

  it("12.3 printed args and expected parse back to the witness values in both forms", () => {
    fc.assert(
      fc.property(witnessCase(false), (c) => {
        const source = build(c);
        const witness = c.witness as Witness & { expected: unknown };
        const args = readBack(argsText(source, witness.export), c.argsHasProto);
        expect(args).toStrictEqual(witness.args);
        expect(JSON.stringify(args)).toBe(JSON.stringify(witness.args));
        const expected = readBack(expectedText(source), c.expectedHasProto);
        expect(expected).toStrictEqual(witness.expected);
        expect(JSON.stringify(expected)).toBe(JSON.stringify(witness.expected));
      }),
    );
  });

  it("12.4 the plain form is the indented JSON text and the output has no JSON.parse call", () => {
    fc.assert(
      fc.property(
        witnessCase(false).filter((c) => !c.argsHasProto && !c.expectedHasProto),
        (c) => {
          const source = build(c);
          const witness = c.witness as Witness & { expected: unknown };
          const printedArgs = argsText(source, witness.export).split("\n  ").join("\n");
          expect(printedArgs).toBe(JSON.stringify(witness.args, null, 2));
          const printedExpected = expectedText(source).split("\n  ").join("\n");
          expect(printedExpected).toBe(JSON.stringify(witness.expected, null, 2));
          expect(source).not.toContain("JSON.parse");
        },
      ),
    );
  });

  it("12.5 a __proto__ key switches only the value that holds it to the JSON.parse form", () => {
    fc.assert(
      fc.property(anyCase, (c) => {
        const source = build(c);
        const count = source.split("JSON.parse(").length - 1;
        expect(count).toBe(Number(c.argsHasProto) + Number(c.expectedHasProto));
        expect(argsText(source, c.witness.export).startsWith("JSON.parse(")).toBe(c.argsHasProto);
        if (!("expectedError" in c.witness)) {
          expect(expectedText(source).startsWith("JSON.parse(")).toBe(c.expectedHasProto);
        }
      }),
    );
  });

  it("12.6 the arguments are cast through unknown to the parameters of the export", () => {
    fc.assert(
      fc.property(anyCase, (c) => {
        const source = build(c);
        expect(source).toContain(` as unknown as Parameters<typeof ${c.witness.export}>;`);
        expect(source).toContain(`${c.witness.export}(...args)`);
      }),
    );
  });

  it("12.6 the import path resolves to the file of witness.from without its extension", () => {
    fc.assert(
      fc.property(anyCase, (c) => {
        const source = build(c);
        const match = /^import \{ [^}]+ \} from ("\.[^"\n]*");$/m.exec(source);
        expect(match).not.toBeNull();
        const specifier = JSON.parse((match as RegExpExecArray)[1] as string) as string;
        expect(specifier.startsWith("./") || specifier.startsWith("../")).toBe(true);
        expect(resolveFrom(c.testFile, specifier)).toBe(c.witness.from.replace(/\.tsx?$/, ""));
      }),
    );
  });

  it("12.7 an invalid name or an unsafe path gives an error that names the field and no source", () => {
    const bad = fc.constantFrom("a-b", "1X", "", "a b", "x.y");
    const unsafePath = fc.constantFrom("../a/b.ts", "a/../b.ts", "/abs/b.ts", "..");
    fc.assert(
      fc.property(
        witnessCase(true),
        bad,
        unsafePath,
        fc.constantFrom("export", "expectedError", "from", "testFile"),
        (c, badName, badPath, field) => {
          const witness = c.witness as Witness & { expectedError: string };
          let input = { witness, criterion: c.criterion, testFile: c.testFile };
          if (field === "export") input = { ...input, witness: { ...witness, export: badName } };
          if (field === "expectedError") {
            input = { ...input, witness: { ...witness, expectedError: badName } };
          }
          if (field === "from") input = { ...input, witness: { ...witness, from: badPath } };
          if (field === "testFile") input = { ...input, testFile: badPath };
          const result = buildWitnessTest(input);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.field).toBe(field);
            expect(result.error.message).toContain(field === "testFile" ? "testFile" : field);
          }
        },
      ),
    );
  });
});

/** A deep copy that keeps own `__proto__` keys, to prove equal input gives equal output. */
function structuredCloneWitness(witness: Witness): Witness {
  return structuredClone(witness);
}
