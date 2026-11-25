import type { Species } from "./types.js";

/**
 * Copy of the species table in `.kiro/steering/bestiary.md`.
 * A unit test checks that this constant matches the table.
 * Oathbreaker has no mutator names: it belongs to Spec_Mutants, not to Stryker mutators.
 */
export const SPECIES_TABLE: ReadonlyArray<{
  readonly species: Exclude<Species, "Unclassified">;
  readonly mutators: readonly string[];
}> = [
  { species: "Borderling", mutators: ["EqualityOperator"] },
  {
    species: "Miscount",
    mutators: ["ArithmeticOperator", "UpdateOperator", "UnaryOperator", "AssignmentOperator"],
  },
  {
    species: "Two-Face",
    mutators: ["ConditionalExpression", "LogicalOperator", "BooleanLiteral"],
  },
  {
    species: "Hollow",
    mutators: [
      "BlockStatement",
      "ArrayDeclaration",
      "ObjectLiteral",
      "StringLiteral",
      "ArrowFunction",
    ],
  },
  { species: "Impostor", mutators: ["MethodExpression", "Regex", "OptionalChaining"] },
  { species: "Oathbreaker", mutators: [] },
];

const BY_MUTATOR: ReadonlyMap<string, Species> = new Map(
  SPECIES_TABLE.flatMap((row) => row.mutators.map((name) => [name, row.species] as const)),
);

/**
 * Maps a Stryker mutator name to a species. Total: unknown names give Unclassified.
 * No table row currently depends on the replacement text, so it is accepted and unused.
 */
export function classifySpecies(mutatorName: string, _replacementText: string): Species {
  return BY_MUTATOR.get(mutatorName) ?? "Unclassified";
}
