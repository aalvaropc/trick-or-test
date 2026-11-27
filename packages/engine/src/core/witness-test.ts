import { err, ok, type Result } from "./result.js";
import { isSafeRelativePath } from "./spec-mutants.js";
import type { CriterionId, Witness } from "./types.js";

export type WitnessTestError = {
  field: "export" | "expectedError" | "from" | "testFile";
  message: string;
};

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const INDENT = "  ";

/** True when an object at any depth of `value` has an own key `__proto__`. */
const containsProtoKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsProtoKey);
  if (typeof value === "object" && value !== null) {
    if (Object.hasOwn(value, "__proto__")) return true;
    return Object.values(value).some(containsProtoKey);
  }
  return false;
};

/** JSON text of `value` with every line after the first indented by the body indent of the test. */
const printJson = (value: unknown): string => {
  const text = JSON.stringify(value, null, 2) ?? "null";
  return text.split("\n").join(`\n${INDENT}`);
};

/** A JavaScript expression for `value`: plain JSON text, or `JSON.parse("...")` when a `__proto__` key would change meaning. */
const printExpression = (value: unknown): string =>
  containsProtoKey(value)
    ? `JSON.parse(${JSON.stringify(JSON.stringify(value))})`
    : printJson(value);

/** Import specifier from the directory of `testFile` to `from`, computed on `/`-separated strings. */
const importSpecifier = (testFile: string, from: string): string => {
  const testDirs = testFile.split("/").slice(0, -1);
  const fromParts = from.replace(/\.tsx?$/, "").split("/");
  const fromDirs = fromParts.slice(0, -1);
  const base = fromParts[fromParts.length - 1] ?? "";
  let common = 0;
  while (
    common < testDirs.length &&
    common < fromDirs.length &&
    testDirs[common] === fromDirs[common]
  ) {
    common += 1;
  }
  const ups = testDirs.length - common;
  const segments = [...Array<string>(ups).fill(".."), ...fromDirs.slice(common), base];
  const joined = segments.join("/");
  return joined.startsWith(".") ? joined : `./${joined}`;
};

/** Builds the source of one Vitest test that asserts a Witness (Requirement 12). */
export function buildWitnessTest(input: {
  witness: Witness;
  criterion: CriterionId;
  testFile: string;
}): Result<string, WitnessTestError> {
  const { witness, criterion, testFile } = input;
  const exportName = witness.export;
  const errorClass = "expectedError" in witness ? witness.expectedError : undefined;

  if (!IDENTIFIER.test(exportName)) {
    return err({
      field: "export",
      message: `export "${exportName}" is not a valid identifier`,
    });
  }
  if (errorClass !== undefined && !IDENTIFIER.test(errorClass)) {
    return err({
      field: "expectedError",
      message: `expectedError "${errorClass}" is not a valid identifier`,
    });
  }
  if (!isSafeRelativePath(witness.from)) {
    return err({
      field: "from",
      message: `from "${witness.from}" must be a project-relative path without ".." segments`,
    });
  }
  if (!isSafeRelativePath(testFile)) {
    return err({
      field: "testFile",
      message: `testFile "${testFile}" must be a project-relative path without ".." segments`,
    });
  }

  const specifier = importSpecifier(testFile, witness.from);
  const names = errorClass === undefined ? exportName : `${exportName}, ${errorClass}`;
  const argsText = `${printExpression(witness.args)} as unknown as Parameters<typeof ${exportName}>;`;
  const lines: string[] = [
    `import { expect, it } from "vitest";`,
    `import { ${names} } from ${JSON.stringify(specifier)};`,
    "",
  ];

  if (errorClass === undefined) {
    const expected = "expected" in witness ? witness.expected : undefined;
    lines.push(
      `it(${JSON.stringify(`${criterion} ${exportName} returns the value the criterion demands`)}, () => {`,
      `${INDENT}const args = ${argsText}`,
      `${INDENT}const expected: unknown = ${printExpression(expected)};`,
      `${INDENT}expect(${exportName}(...args)).toEqual(expected);`,
      "});",
    );
  } else {
    lines.push(
      `it(${JSON.stringify(`${criterion} ${exportName} throws ${errorClass}`)}, () => {`,
      `${INDENT}const args = ${argsText}`,
      `${INDENT}expect(() => ${exportName}(...args)).toThrow(${errorClass});`,
      "});",
    );
  }
  return ok(`${lines.join("\n")}\n`);
}
