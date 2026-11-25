import type { Species } from "trick-or-test/report";

/** Copy of the species table in `.kiro/steering/bestiary.md`. A unit test keeps them in sync. */
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

/** Total: a Spec_Mutant is Oathbreaker, an unknown name is Unclassified. Never throws. */
export function speciesOf(mutatorName: string, isSpecMutant: boolean): Species {
  if (isSpecMutant) return "Oathbreaker";
  return BY_MUTATOR.get(mutatorName) ?? "Unclassified";
}
