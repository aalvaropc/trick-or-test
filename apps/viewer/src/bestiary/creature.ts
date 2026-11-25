import type { Species } from "trick-or-test/report";
import {
  CREATURE_CONFIG,
  type ElementDescriptor,
  type Point,
  VIEW_BOX,
} from "./creature.config.js";
import { escapeXml } from "./escape-xml.js";
import { fnv1a32, mulberry32 } from "./prng.js";
import type { CreatureState } from "./state.js";

/** The parts of a mutant that the structure needs. All optional: a missing part never throws. */
export type CreatureMutant = {
  file?: string | undefined;
  location?: { start: { line: number } } | undefined;
};

const MAX_JITTER = VIEW_BOX.width * 0.08;

const num = (n: number): string => String(Math.round(n * 10) / 10);
const pt = (p: Point): string => `${num(p[0])} ${num(p[1])}`;

function titleOf(species: Species, state: CreatureState, mutant: CreatureMutant): string {
  const file = mutant.file;
  const line = mutant.location?.start.line;
  const where =
    typeof file === "string" && file !== "" && typeof line === "number" && Number.isFinite(line)
      ? `${file}:${line}`
      : "unknown location";
  return `${species}, ${state}: ${where}`;
}

function element(
  descriptor: ElementDescriptor,
  jitter: (p: Point) => Point,
  kindAttr: string,
): string {
  const [a, b, c, d] = descriptor.points;
  switch (descriptor.kind) {
    case "curve": {
      const [p0, p1, p2, p3] = [a, b, c, d].map((p) => jitter(p as Point)) as [
        Point,
        Point,
        Point,
        Point,
      ];
      return `<path ${kindAttr} d="M ${pt(p0)} C ${pt(p1)} ${pt(p2)} ${pt(p3)}"/>`;
    }
    case "limb":
      return `<line ${kindAttr} x1="${num((a as Point)[0])}" y1="${num((a as Point)[1])}" x2="${num((b as Point)[0])}" y2="${num((b as Point)[1])}"/>`;
    case "eye":
      return `<circle ${kindAttr} cx="${num((a as Point)[0])}" cy="${num((a as Point)[1])}" r="4"/>`;
    case "mask":
      return `<ellipse ${kindAttr} cx="${num((a as Point)[0])}" cy="${num((a as Point)[1])}" rx="16" ry="20"/>`;
    case "scroll":
      return `<rect ${kindAttr} x="${num((a as Point)[0] - 18)}" y="${num((a as Point)[1] - 10)}" width="36" height="20"/>`;
    case "pattern-shade":
      return `<g ${kindAttr}/>`;
  }
}

/**
 * Structure of one creature as an SVG string. Pure and deterministic.
 * Jitter moves each body point by at most 8% of the viewBox width. Shared curve
 * endpoints move together, so the body stays closed.
 */
export function creature(
  species: Species,
  seed: string,
  state: CreatureState,
  mutant: CreatureMutant,
): string {
  const rand = mulberry32(fnv1a32(seed));
  const moved = new Map<string, Point>();
  const jitter = (p: Point): Point => {
    const key = `${p[0]},${p[1]}`;
    let q = moved.get(key);
    if (!q) {
      q = [p[0] + (rand() * 2 - 1) * MAX_JITTER, p[1] + (rand() * 2 - 1) * MAX_JITTER];
      moved.set(key, q);
    }
    return q;
  };
  const { minX, minY, width, height } = VIEW_BOX;
  const body = (CREATURE_CONFIG[species] ?? CREATURE_CONFIG.Unclassified)
    .map((d) => element(d, jitter, `data-kind="${d.kind}"`))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="${minX} ${minY} ${width} ${height}"><title>${escapeXml(titleOf(species, state, mutant))}</title>${body}</svg>`;
}
