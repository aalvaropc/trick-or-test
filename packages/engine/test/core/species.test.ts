import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifySpecies, SPECIES_TABLE } from "../../src/core/species.js";

const BESTIARY = fileURLToPath(new URL("../../../../.kiro/steering/bestiary.md", import.meta.url));

describe("classifySpecies", () => {
  it("3.11 EqualityOperator is a Borderling", () => {
    expect(classifySpecies("EqualityOperator", "<=")).toBe("Borderling");
  });

  it("3.11 ArithmeticOperator, UpdateOperator, UnaryOperator and AssignmentOperator are Miscounts", () => {
    for (const name of [
      "ArithmeticOperator",
      "UpdateOperator",
      "UnaryOperator",
      "AssignmentOperator",
    ]) {
      expect(classifySpecies(name, "-")).toBe("Miscount");
    }
  });

  it("3.11 ConditionalExpression, LogicalOperator and BooleanLiteral are Two-Faces", () => {
    for (const name of ["ConditionalExpression", "LogicalOperator", "BooleanLiteral"]) {
      expect(classifySpecies(name, "true")).toBe("Two-Face");
    }
  });

  it("3.11 BlockStatement, ArrayDeclaration, ObjectLiteral, StringLiteral and ArrowFunction are Hollows", () => {
    for (const name of [
      "BlockStatement",
      "ArrayDeclaration",
      "ObjectLiteral",
      "StringLiteral",
      "ArrowFunction",
    ]) {
      expect(classifySpecies(name, "{}")).toBe("Hollow");
    }
  });

  it("3.11 MethodExpression, Regex and OptionalChaining are Impostors", () => {
    for (const name of ["MethodExpression", "Regex", "OptionalChaining"]) {
      expect(classifySpecies(name, "max")).toBe("Impostor");
    }
  });

  it("3.12 an unknown mutatorName is Unclassified", () => {
    expect(classifySpecies("NoSuchMutator", "x")).toBe("Unclassified");
    expect(classifySpecies("", "")).toBe("Unclassified");
  });

  it("3.12 the Oathbreaker row is not reachable from a mutatorName", () => {
    expect(classifySpecies("Spec mutants", "x")).toBe("Unclassified");
  });

  it("3.13 `<` to `<=` and `>` to `>=` boundary replacements are Borderlings", () => {
    for (const replacement of ["<", "<=", ">", ">="]) {
      expect(classifySpecies("EqualityOperator", replacement)).toBe("Borderling");
    }
  });

  it("3.13 the same input gives the same species on every call", () => {
    expect(classifySpecies("Regex", "a")).toBe(classifySpecies("Regex", "a"));
  });
});

describe("species table", () => {
  it("8.14 the constant matches the table in .kiro/steering/bestiary.md", () => {
    const lines = readFileSync(BESTIARY, "utf8").split("\n");
    const start = lines.findIndex((l) => l.trim() === "## Species");
    expect(start).toBeGreaterThanOrEqual(0);

    const rows: Array<{ species: string; mutators: string[] }> = [];
    for (const line of lines.slice(start + 1)) {
      if (line.startsWith("## ")) break;
      if (!line.startsWith("|")) continue;
      const cells = line.split("|").map((c) => c.trim());
      const [species, mutators] = [cells[1] ?? "", cells[2] ?? ""];
      if (species === "Species" || /^-+$/.test(species)) continue;
      if (species === "Unclassified") continue;
      rows.push({
        species,
        mutators: mutators === "Spec mutants" ? [] : mutators.split(",").map((m) => m.trim()),
      });
    }

    expect(SPECIES_TABLE.map((r) => ({ species: r.species, mutators: [...r.mutators] }))).toEqual(
      rows,
    );
  });
});
