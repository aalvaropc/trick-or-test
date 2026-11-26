const ROOT_TAG = /^(\s*(?:<\?[\s\S]*?\?>\s*)?)<svg(\s[^>]*)?(\/?)>/;
const SIZE_ATTR = /\s(?:width|height)=(?:"[^"]*"|'[^']*')/g;

/**
 * Sets `width` and `height` on the root `<svg>` start tag and changes nothing else.
 * Returns the input unchanged when it has no root start tag. Never throws.
 */
export function withSize(svg: string, size: number): string {
  const match = ROOT_TAG.exec(svg);
  if (match === null) return svg;
  const prefix = match[1] ?? "";
  const attrs = (match[2] ?? "").replace(SIZE_ATTR, "");
  const selfClose = match[3] ?? "";
  const tag = `<svg${attrs} width="${size}" height="${size}"${selfClose}>`;
  return prefix + tag + svg.slice(match[0].length);
}
