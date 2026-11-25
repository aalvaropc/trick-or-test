import type { Species } from "trick-or-test/report";
import {
  COLOR_TOKENS,
  CREATURE_CONFIG,
  type ElementDescriptor,
  LIT_EYE_COLOR,
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

/** How one state draws a creature. Every colour is a token of `bestiary.md`. */
export interface StateStyle {
  readonly stroke: string;
  readonly strokeWidth: number;
  /** Fill of closed shapes (body curves, mask, scroll). */
  readonly fill: string;
  readonly dash: string | null;
  readonly opacity: number | null;
  readonly eyes: boolean;
  readonly shade: boolean;
}

const SURVIVOR_STROKE_WIDTH = 3;

export function stateStyle(state: CreatureState): StateStyle {
  switch (state) {
    case "survivor":
      return {
        stroke: COLOR_TOKENS.bone,
        strokeWidth: SURVIVOR_STROKE_WIDTH,
        fill: COLOR_TOKENS.ink,
        dash: null,
        opacity: null,
        eyes: true,
        shade: true,
      };
    case "killed":
      return {
        stroke: COLOR_TOKENS.bone,
        strokeWidth: SURVIVOR_STROKE_WIDTH / 2,
        fill: "none",
        dash: null,
        opacity: null,
        eyes: false,
        shade: false,
      };
    case "in-the-dark":
      return {
        stroke: COLOR_TOKENS.bone,
        strokeWidth: SURVIVOR_STROKE_WIDTH,
        fill: COLOR_TOKENS.bone,
        dash: null,
        opacity: null,
        eyes: false,
        shade: false,
      };
    case "ghost":
      return {
        stroke: COLOR_TOKENS.mist,
        strokeWidth: SURVIVOR_STROKE_WIDTH,
        fill: "none",
        dash: "6 4",
        opacity: 0.4,
        eyes: false,
        shade: false,
      };
  }
}

function element(
  descriptor: ElementDescriptor,
  jitter: (p: Point) => Point,
  kindAttr: string,
  style: StateStyle,
  shadeId: string,
): string {
  const [a, b, c, d] = descriptor.points;
  const paint =
    `${kindAttr} fill="${style.fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"` +
    (style.dash === null ? "" : ` stroke-dasharray="${style.dash}"`);
  switch (descriptor.kind) {
    case "curve": {
      const [p0, p1, p2, p3] = [a, b, c, d].map((p) => jitter(p as Point)) as [
        Point,
        Point,
        Point,
        Point,
      ];
      return `<path ${paint} d="M ${pt(p0)} C ${pt(p1)} ${pt(p2)} ${pt(p3)}"/>`;
    }
    case "limb":
      return `<line ${paint.replace(`fill="${style.fill}"`, 'fill="none"')} x1="${num((a as Point)[0])}" y1="${num((a as Point)[1])}" x2="${num((b as Point)[0])}" y2="${num((b as Point)[1])}"/>`;
    case "eye":
      return style.eyes
        ? `<circle ${kindAttr} fill="${LIT_EYE_COLOR}" cx="${num((a as Point)[0])}" cy="${num((a as Point)[1])}" r="4"/>`
        : "";
    case "mask":
      return `<ellipse ${paint} cx="${num((a as Point)[0])}" cy="${num((a as Point)[1])}" rx="16" ry="20"/>`;
    case "scroll":
      return `<rect ${paint} x="${num((a as Point)[0] - 18)}" y="${num((a as Point)[1] - 10)}" width="36" height="20"/>`;
    case "pattern-shade":
      return style.shade
        ? `<ellipse ${kindAttr} fill="url(#${shadeId})" stroke="none" cx="100" cy="100" rx="36" ry="36"/>`
        : "";
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
  const style = stateStyle(state);
  const shadeId = `shade-${fnv1a32(seed).toString(16)}`;
  const body = (CREATURE_CONFIG[species] ?? CREATURE_CONFIG.Unclassified)
    .map((d) => element(d, jitter, `data-kind="${d.kind}"`, style, shadeId))
    .join("");
  const defs = style.shade
    ? `<defs><pattern id="${shadeId}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${COLOR_TOKENS.bone}" stroke-width="1"/></pattern></defs>`
    : "";
  const opacityAttr = style.opacity === null ? "" : ` opacity="${style.opacity}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="${minX} ${minY} ${width} ${height}"${opacityAttr}><title>${escapeXml(titleOf(species, state, mutant))}</title>${defs}${body}</svg>`;
}
