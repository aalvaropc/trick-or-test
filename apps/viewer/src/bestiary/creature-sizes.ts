/** Width and height in px of every creature drawing, by place (Requirement 13.18). */
export const CREATURE_SIZES = {
  sealDrawing: 64,
  sealCreature: 56,
  panelList: 48,
  straysStrip: 56,
  speciesLegend: 96,
  huntEntry: 48,
  specimenPlate: 320,
} as const;

export type CreaturePlace = keyof typeof CREATURE_SIZES;
