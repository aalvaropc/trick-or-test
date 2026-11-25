import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SPECIES_TABLE, speciesOf } from "../../src/bestiary/species.js";

const steeringPath = resolve(__dirname, "../../../../.kiro/steering/bestiary.md");

/** Parses the Species table of bestiary.md into [species, mutator names] rows. */
function parseSteeringTable(): Array<[string, string[]]> {
  const lines = readFileSync(steeringPath, "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith("| Species") && l.includes("Mutators"));
  const rows: Array<[string, string[]]> = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
    const species = cells[1] ?? "";
    const mutators = (cells[2] ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter((m) => m !== "");
    rows.push([species, species === "Oathbreaker" || species === "Unclassified" ? [] : mutators]);
  }
  return rows;
}

describe("speciesOf", () => {
  it("4.1 code table matches the bestiary.md table row for row", () => {
    const doc = parseSteeringTable().filter(([s]) => s !== "Unclassified");
    const code = SPECIES_TABLE.map((r) => [r.species, [...r.mutators]]);
    expect(code).toEqual(doc);
    for (const row of SPECIES_TABLE) {
      for (const name of row.mutators) expect(speciesOf(name, false)).toBe(row.species);
    }
  });

  it("4.2 a Spec_Mutant is Oathbreaker whatever the mutator name", () => {
    expect(speciesOf("EqualityOperator", true)).toBe("Oathbreaker");
    expect(speciesOf("", true)).toBe("Oathbreaker");
  });

  it("4.3 an unknown name is Unclassified and does not throw", () => {
    expect(speciesOf("NoSuchMutator", false)).toBe("Unclassified");
    expect(speciesOf("", false)).toBe("Unclassified");
    expect(speciesOf("constructor", false)).toBe("Unclassified");
  });
});
