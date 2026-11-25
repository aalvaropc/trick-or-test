// Feature: bestiary-viewer, Property V4: Species is total
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { speciesOf } from "../../src/bestiary/species.js";

const SPECIES = [
  "Borderling",
  "Miscount",
  "Two-Face",
  "Hollow",
  "Impostor",
  "Oathbreaker",
  "Unclassified",
];

const steeringPath = resolve(__dirname, "../../../../.kiro/steering/bestiary.md");

/** Reads [mutator name, species] pairs from the Species table of bestiary.md. */
function steeringPairs(): Array<[string, string]> {
  const lines = readFileSync(steeringPath, "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith("| Species") && l.includes("Mutators"));
  const pairs: Array<[string, string]> = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
    const species = cells[1] ?? "";
    if (species === "Oathbreaker" || species === "Unclassified") continue;
    for (const name of (cells[2] ?? "").split(",")) {
      if (name.trim() !== "") pairs.push([name.trim(), species]);
    }
  }
  return pairs;
}

describe("speciesOf properties", () => {
  it("4.3 any string maps to one of the seven species and never throws", () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), (name, isSpec) => {
        expect(SPECIES).toContain(speciesOf(name, isSpec));
      }),
    );
  });

  it("4.1 every mutator name in the bestiary.md table returns its row's species", () => {
    const pairs = steeringPairs();
    expect(pairs.length).toBeGreaterThan(0);
    fc.assert(
      fc.property(fc.constantFrom(...pairs), ([name, species]) => {
        expect(speciesOf(name, false)).toBe(species);
      }),
    );
  });

  it("4.2 a Spec_Mutant is Oathbreaker for any name", () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        expect(speciesOf(name, true)).toBe("Oathbreaker");
      }),
    );
  });
});
