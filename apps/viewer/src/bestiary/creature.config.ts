import type { Species } from "trick-or-test/report";

/** The viewBox is the same for every species, seed and state. */
export const VIEW_BOX = { minX: 0, minY: 0, width: 200, height: 200 } as const;

/** Colour tokens of `.kiro/steering/bestiary.md`. No other colour value exists in the viewer's drawings. */
export const COLOR_TOKENS = {
  ink: "#0C0E12",
  bone: "#E9E2D0",
  amber: "#F2B544",
  verdigris: "#4CC38A",
  mist: "#7A8699",
  ember: "#E5484D",
} as const;

/** The lit-eye colour of a survivor. */
export const LIT_EYE_COLOR = COLOR_TOKENS.amber;

export type Point = readonly [number, number];

export type ElementKind = "curve" | "limb" | "eye" | "pattern-shade" | "mask" | "scroll";

/**
 * One drawn element. A curve has four points (start, two control points, end),
 * a limb two (start, end), an eye one (centre). Mask and scroll have one point (centre).
 * Shade has none: it fills the body with a hatching pattern.
 */
export interface ElementDescriptor {
  readonly kind: ElementKind;
  readonly points: readonly Point[];
}

export const SPECIES_LIST: readonly Species[] = [
  "Borderling",
  "Miscount",
  "Two-Face",
  "Hollow",
  "Impostor",
  "Oathbreaker",
  "Unclassified",
];

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Closed body of `count` cubic curves around an ellipse centred in the viewBox. */
function body(count: number, rx: number, ry: number): ElementDescriptor[] {
  const cx = VIEW_BOX.width / 2;
  const cy = VIEW_BOX.height / 2;
  const k = (4 / 3) * Math.tan(Math.PI / (2 * count));
  const at = (angle: number): Point => [
    round1(cx + rx * Math.cos(angle)),
    round1(cy + ry * Math.sin(angle)),
  ];
  const tangent = (angle: number): Point => [-rx * Math.sin(angle) * k, ry * Math.cos(angle) * k];
  return Array.from({ length: count }, (_, i) => {
    const a0 = (2 * Math.PI * i) / count;
    const a1 = (2 * Math.PI * (i + 1)) / count;
    const p0 = at(a0);
    const p3 = at(a1);
    const t0 = tangent(a0);
    const t1 = tangent(a1);
    const p1: Point = [round1(p0[0] + t0[0]), round1(p0[1] + t0[1])];
    const p2: Point = [round1(p3[0] - t1[0]), round1(p3[1] - t1[1])];
    return { kind: "curve", points: [p0, p1, p2, p3] };
  });
}

const limb = (a: Point, b: Point): ElementDescriptor => ({ kind: "limb", points: [a, b] });
const eye = (x: number, y: number): ElementDescriptor => ({ kind: "eye", points: [[x, y]] });
const shade: ElementDescriptor = { kind: "pattern-shade", points: [] };

/** Per-species element list. Count and kind order are fixed; a seed only jitters the points. */
export const CREATURE_CONFIG: Readonly<Record<Species, readonly ElementDescriptor[]>> = {
  // Thin and stretched along a horizontal boundary line, one limb across it.
  Borderling: [...body(3, 60, 20), limb([100, 50], [100, 150]), eye(80, 96), eye(120, 96), shade],
  // Lopsided: two limbs on the left, one on the right, one eye.
  Miscount: [
    ...body(4, 50, 50),
    limb([50, 90], [24, 80]),
    limb([50, 115], [24, 130]),
    limb([150, 100], [176, 100]),
    eye(88, 90),
    shade,
  ],
  // Two faces looking opposite ways.
  "Two-Face": [...body(4, 56, 46), limb([100, 56], [100, 144]), eye(78, 92), eye(122, 92), shade],
  // An outline with an empty ribcage.
  Hollow: [
    ...body(5, 46, 56),
    limb([76, 84], [124, 84]),
    limb([72, 104], [128, 104]),
    limb([76, 124], [124, 124]),
    eye(86, 64),
    eye(114, 64),
  ],
  // A body holding a mask slightly off its face.
  Impostor: [...body(4, 50, 52), { kind: "mask", points: [[108, 90]] }, eye(86, 88), shade],
  // Carries a torn scroll.
  Oathbreaker: [
    ...body(5, 50, 50),
    { kind: "scroll", points: [[100, 150]] },
    eye(84, 88),
    eye(116, 88),
    shade,
  ],
  // Plain shape; the dotted outline is a style, not an element.
  Unclassified: [...body(3, 52, 52), eye(100, 96)],
};
