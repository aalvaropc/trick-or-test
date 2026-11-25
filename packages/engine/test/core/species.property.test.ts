// Property 9: Species is total. Validates: Requirements 3.11, 3.12, 3.13, 8.14
import fc from "fast-check";
import { describe, it } from "vitest";
import { classifySpecies, SPECIES_TABLE } from "../../src/core/species.js";

const ALL_SPECIES = new Set<string>([...SPECIES_TABLE.map((row) => row.species), "Unclassified"]);
const KNOWN_NAMES = SPECIES_TABLE.flatMap((row) => row.mutators);

const mutatorName = fc.oneof(
  fc.constantFrom(...KNOWN_NAMES),
  fc.string({ maxLength: 20 }),
  fc.constantFrom("", "Spec mutants", "equalityoperator", "__proto__", "constructor", "toString"),
);

const boundaryReplacement = fc.constantFrom("<", "<=", ">", ">=");
const replacement = fc.oneof(boundaryReplacement, fc.string({ maxLength: 20 }));

describe("Property 9: Species is total", () => {
  it("3.11 returns exactly one known species or Unclassified and never throws", () => {
    fc.assert(
      fc.property(mutatorName, replacement, (name, text) => {
        const species = classifySpecies(name, text);
        return typeof species === "string" && ALL_SPECIES.has(species);
      }),
    );
  });

  it("3.11 is deterministic for the same inputs", () => {
    fc.assert(
      fc.property(mutatorName, replacement, (name, text) => {
        const first = classifySpecies(name, text);
        const second = classifySpecies(name, text);
        return first === second;
      }),
    );
  });

  it("3.12 maps any name outside the table to Unclassified", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 20 }).filter((s) => !KNOWN_NAMES.includes(s)),
        replacement,
        (name, text) => classifySpecies(name, text) === "Unclassified",
      ),
    );
  });

  it("3.13 returns Borderling for EqualityOperator whatever the replacement, including < <= > >=", () => {
    fc.assert(
      fc.property(
        replacement,
        (text) => classifySpecies("EqualityOperator", text) === "Borderling",
      ),
    );
  });

  it("8.14 never assigns Oathbreaker from a mutator name, and the table keeps a nameless Oathbreaker row", () => {
    const row = SPECIES_TABLE.find((r) => r.species === "Oathbreaker");
    fc.assert(
      fc.property(
        mutatorName,
        replacement,
        (name, text) =>
          row !== undefined &&
          row.mutators.length === 0 &&
          classifySpecies(name, text) !== "Oathbreaker",
      ),
    );
  });
});
