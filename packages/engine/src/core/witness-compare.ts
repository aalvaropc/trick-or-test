export type WitnessExpectation = { expected: unknown } | { expectedError: string };

export type WitnessOutcome =
  | { kind: "value"; value: unknown }
  | { kind: "error"; className: string }
  | { kind: "timeout"; message: string }
  | { kind: "no-outcome"; message: string };

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

/** Reduces a value to its JSON form. Unserializable values (top-level undefined, functions, BigInt) become undefined or stay as-is without throwing. */
function toJsonForm(value: unknown): unknown {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? undefined : JSON.parse(text);
  } catch {
    return value;
  }
}

/**
 * Compares a witness expectation with an observed outcome.
 * Values use deep structural equality (object key order ignored, array order significant).
 * Errors match on class name only.
 */
export function matchesExpectation(expected: WitnessExpectation, actual: WitnessOutcome): boolean {
  if ("expectedError" in expected) {
    return actual.kind === "error" && actual.className === expected.expectedError;
  }
  return (
    actual.kind === "value" && deepEqual(toJsonForm(expected.expected), toJsonForm(actual.value))
  );
}

/** Compares the outcome on the original code with the outcome on the mutated code. */
export function compareOutcomes(
  original: WitnessOutcome,
  mutated: WitnessOutcome,
): "same" | "different" {
  if (original.kind !== mutated.kind) return "different";
  switch (original.kind) {
    case "value":
      return deepEqual(
        toJsonForm(original.value),
        toJsonForm((mutated as { kind: "value"; value: unknown }).value),
      )
        ? "same"
        : "different";
    case "error":
      return original.className === (mutated as { kind: "error"; className: string }).className
        ? "same"
        : "different";
    default:
      return "same";
  }
}

export function compareWitnessOutcome(
  expected: WitnessExpectation,
  actual: WitnessOutcome,
): "match" | "mismatch" {
  return matchesExpectation(expected, actual) ? "match" : "mismatch";
}
