export type WitnessExpectation = { expected: unknown } | { expectedError: string };

export type WitnessOutcome =
  | { kind: "value"; value: unknown }
  | { kind: "error"; className: string };

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;

  if (aIsArray) {
    const bArr = b as unknown[];
    if (a.length !== bArr.length) return false;
    return a.every((item, i) => deepEqual(item, bArr[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  if (aKeys.length !== Object.keys(bObj).length) return false;
  return aKeys.every((key) => Object.hasOwn(bObj, key) && deepEqual(aObj[key], bObj[key]));
}

/**
 * Compares a witness expectation with an observed outcome.
 * Values use deep structural equality (object key order ignored, array order significant).
 * Errors match on class name only.
 */
export function compareWitnessOutcome(
  expected: WitnessExpectation,
  actual: WitnessOutcome,
): "match" | "mismatch" {
  if ("expectedError" in expected) {
    return actual.kind === "error" && actual.className === expected.expectedError
      ? "match"
      : "mismatch";
  }
  return actual.kind === "value" && deepEqual(expected.expected, actual.value)
    ? "match"
    : "mismatch";
}
