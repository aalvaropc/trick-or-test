import { describe, expect, it } from "vitest";
import type { CriterionId, Witness } from "../../src/core/types.js";
import { buildWitnessTest, type WitnessTestError } from "../../src/core/witness-test.js";

const crit = "5.5" as CriterionId;

const valueWitness = (
  over: Partial<{ from: string; export: string; args: unknown[]; expected: unknown }> = {},
): Witness => ({
  from: "src/index.ts",
  export: "priceCart",
  args: [{ lines: [1, 2] }],
  expected: { total: 0 },
  ...over,
});

const errorWitness = (
  over: Partial<{ from: string; export: string; expectedError: string }> = {},
): Witness => ({
  from: "src/index.ts",
  export: "priceCart",
  args: [],
  expectedError: "ValidationError",
  ...over,
});

const build = (witness: Witness, testFile = "test/hunt/oath-5.5.test.ts"): string => {
  const r = buildWitnessTest({ witness, criterion: crit, testFile });
  if (!r.ok) throw new Error(`unexpected error: ${r.error.message}`);
  return r.value;
};

const fail = (witness: Witness, testFile = "test/hunt/oath-5.5.test.ts"): WitnessTestError => {
  const r = buildWitnessTest({ witness, criterion: crit, testFile });
  if (r.ok) throw new Error("expected an error");
  return r.error;
};

/** Text between the markers, with the body indent removed. */
const cut = (src: string, start: string, end: string): string => {
  const from = src.indexOf(start) + start.length;
  const to = src.indexOf(end, from);
  return src
    .slice(from, to)
    .split("\n")
    .map((l, i) => (i === 0 ? l : l.slice(2)))
    .join("\n");
};
const cutArgs = (src: string): string =>
  cut(src, "const args = ", " as unknown as Parameters<typeof priceCart>;");
const cutExpected = (src: string): string => cut(src, "const expected: unknown = ", ";\n");

describe("buildWitnessTest import path", () => {
  it("12.2 test/hunt/oath-5.5.test.ts importing src/index.ts gives ../../src/index", () => {
    expect(build(valueWitness())).toContain('import { priceCart } from "../../src/index";');
  });

  it("12.2 a test file in the directory of the module gives ./index", () => {
    expect(build(valueWitness(), "src/oath.test.ts")).toContain('from "./index";');
  });

  it("12.2 a .tsx extension is removed from the import path", () => {
    expect(build(valueWitness({ from: "src/ui/Cart.tsx" }))).toContain('from "../../src/ui/Cart";');
  });
});

describe("buildWitnessTest assertions", () => {
  it("12.3 a Witness with expected asserts with toEqual and not toThrow", () => {
    const src = build(valueWitness());
    expect(src).toContain("expect(priceCart(...args)).toEqual(expected);");
    expect(src).not.toContain("toThrow");
  });

  it("12.3 a Witness with expectedError asserts with toThrow and imports the class", () => {
    const src = build(errorWitness());
    expect(src).toContain('import { priceCart, ValidationError } from "../../src/index";');
    expect(src).toContain("expect(() => priceCart(...args)).toThrow(ValidationError);");
    expect(src).not.toContain("toEqual");
  });

  it("12.4 the test name starts with the Criterion id and a space", () => {
    expect(build(valueWitness())).toContain('it("5.5 priceCart ');
    expect(build(errorWitness())).toContain('it("5.5 priceCart ');
  });
});

describe("buildWitnessTest output shape", () => {
  it("12.6 the output has the fixed format and no JSON.parse call", () => {
    const src = build(valueWitness({ args: [{ a: 1 }], expected: { total: 0 } }));
    expect(src).toBe(
      [
        'import { expect, it } from "vitest";',
        'import { priceCart } from "../../src/index";',
        "",
        'it("5.5 priceCart returns the value the criterion demands", () => {',
        "  const args = [",
        "    {",
        '      "a": 1',
        "    }",
        "  ] as unknown as Parameters<typeof priceCart>;",
        "  const expected: unknown = {",
        '    "total": 0',
        "  };",
        "  expect(priceCart(...args)).toEqual(expected);",
        "});",
        "",
      ].join("\n"),
    );
    expect(src).not.toContain("JSON.parse");
  });

  it("12.6 the error form has the fixed format", () => {
    expect(build(errorWitness({ export: "f" }))).toBe(
      [
        'import { expect, it } from "vitest";',
        'import { f, ValidationError } from "../../src/index";',
        "",
        'it("5.5 f throws ValidationError", () => {',
        "  const args = [] as unknown as Parameters<typeof f>;",
        "  expect(() => f(...args)).toThrow(ValidationError);",
        "});",
        "",
      ].join("\n"),
    );
  });

  it.each([
    ["null", null],
    ["0", 0],
    ["a nested object", { a: { b: [1, { c: null }] }, d: "x" }],
    ["a string with quotes and a backslash", 'say "hi" \\ bye'],
  ])("12.6 expected %s is JSON.stringify text and parses back", (_n, value) => {
    const src = build(valueWitness({ expected: value }));
    const text = cutExpected(src);
    expect(text).toBe(JSON.stringify(value, null, 2));
    expect(JSON.parse(text)).toEqual(value);
  });

  it("12.6 args with nested arrays print as JSON.stringify text and parse back", () => {
    const args = [[1, [2, 3]], { k: [[], [{}]] }];
    const text = cutArgs(build(valueWitness({ args })));
    expect(text).toBe(JSON.stringify(args, null, 2));
    expect(JSON.parse(text)).toEqual(args);
  });

  it("12.6 empty args print as []", () => {
    expect(build(valueWitness({ args: [] }))).toContain(
      "const args = [] as unknown as Parameters<typeof priceCart>;",
    );
  });

  it("12.6 keys keep the order of the Witness object", () => {
    const src = build(valueWitness({ expected: { z: 1, a: 2, m: 3 } }));
    expect(src.indexOf('"z"')).toBeLessThan(src.indexOf('"a"'));
    expect(src.indexOf('"a"')).toBeLessThan(src.indexOf('"m"'));
  });

  it("12.6 two calls with equal input give equal strings", () => {
    expect(build(valueWitness())).toBe(build(valueWitness()));
  });
});

describe("buildWitnessTest __proto__ keys", () => {
  const proto = JSON.parse('{"__proto__": {"x": 1}, "y": 2}') as unknown;
  const protoNested = JSON.parse('[{"a": [{"__proto__": 1}]}]') as unknown[];

  /** Evaluates the printed JSON.parse("...") expression. */
  const evalForm = (text: string): unknown => {
    const m = /^JSON\.parse\((".*")\)$/s.exec(text);
    if (m === null) throw new Error("not the JSON.parse form");
    return JSON.parse(JSON.parse(m[1] as string) as string);
  };

  it("12.6 a top-level __proto__ key in args switches only args to the JSON.parse form", () => {
    const src = build(valueWitness({ args: [proto] }));
    const text = cut(src, "const args = ", " as unknown as Parameters<typeof priceCart>;");
    const value = evalForm(text) as unknown[];
    expect(Object.hasOwn(value[0] as object, "__proto__")).toBe(true);
    expect(src).toContain("const expected: unknown = {\n");
  });

  it("12.6 a nested __proto__ key in args switches args to the JSON.parse form", () => {
    const src = build(valueWitness({ args: protoNested }));
    const text = cutArgs(src);
    expect(text.startsWith("JSON.parse(")).toBe(true);
    const value = evalForm(text) as Array<{ a: Array<object> }>;
    expect(Object.hasOwn(value[0]?.a[0] as object, "__proto__")).toBe(true);
  });

  it("12.6 a __proto__ key in expected switches only expected", () => {
    const src = build(valueWitness({ expected: proto }));
    const value = evalForm(cutExpected(src)) as object;
    expect(Object.hasOwn(value, "__proto__")).toBe(true);
    expect(cutArgs(src).startsWith("[")).toBe(true);
  });

  it("12.6 a __proto__ key in both uses the form for both", () => {
    const src = build(valueWitness({ args: [proto], expected: proto }));
    expect(cutArgs(src).startsWith("JSON.parse(")).toBe(true);
    expect(cutExpected(src).startsWith("JSON.parse(")).toBe(true);
  });
});

describe("buildWitnessTest errors", () => {
  it("12.5 an export name a-b is rejected naming the field export", () => {
    const e = fail(valueWitness({ export: "a-b" }));
    expect(e.field).toBe("export");
    expect(e.message).toContain("a-b");
  });

  it("12.5 an error class 1X is rejected naming the field expectedError", () => {
    expect(fail(errorWitness({ expectedError: "1X" })).field).toBe("expectedError");
  });

  it("12.5 a from with .. is rejected naming the field from", () => {
    expect(fail(valueWitness({ from: "../src/index.ts" })).field).toBe("from");
  });

  it("12.5 an absolute from is rejected naming the field from", () => {
    expect(fail(valueWitness({ from: "/src/index.ts" })).field).toBe("from");
  });

  it("12.5 an absolute testFile is rejected naming the field testFile", () => {
    expect(fail(valueWitness(), "/test/a.test.ts").field).toBe("testFile");
  });

  it("12.5 a testFile with .. is rejected naming the field testFile", () => {
    expect(fail(valueWitness(), "test/../a.test.ts").field).toBe("testFile");
  });

  it("12.5 an error result carries no source", () => {
    const r = buildWitnessTest({
      witness: valueWitness({ export: "a-b" }),
      criterion: crit,
      testFile: "test/a.test.ts",
    });
    expect(r.ok).toBe(false);
    expect("value" in r).toBe(false);
  });
});
