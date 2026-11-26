const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes `& < > " '` in one pass, so an ampersand is never escaped twice. */
export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ENTITIES[c] as string);
}
