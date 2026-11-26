import { describe, expect, it } from "vitest";
import { CREATURE_SIZES } from "../../src/bestiary/creature-sizes.js";

describe("creature sizes", () => {
  it("13.18 the seven values equal the table", () => {
    expect(CREATURE_SIZES).toEqual({
      sealDrawing: 64,
      sealCreature: 56,
      panelList: 48,
      straysStrip: 56,
      speciesLegend: 96,
      huntEntry: 48,
      specimenPlate: 320,
    });
  });

  it("13.23 every value is at most 320", () => {
    for (const size of Object.values(CREATURE_SIZES)) expect(size).toBeLessThanOrEqual(320);
  });
});
