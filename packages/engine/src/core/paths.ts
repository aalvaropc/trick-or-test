/**
 * Path handling for report fields (Requirement 8.17). Pure string work: no `node:` imports.
 *
 * Rules:
 * - A path under the project root becomes a project-relative path with `/` separators.
 *   The root itself becomes `.`.
 * - Any other absolute path (POSIX, Windows drive or UNC) becomes `<outside-project>/<basename>`.
 * - URLs are not paths. Paths that contain spaces are not detected inside free text.
 */

const OUTSIDE = "<outside-project>";

const STOP = String.raw`\s"'\`<>|*?:,;()\[\]{}`;
// UNC: \\host\share\...
const UNC = String.raw`\\\\[^${STOP}\\/]+(?:\\[^${STOP}\\]*)+`;
// Windows drive: C:\... or C:/...
const DRIVE = String.raw`(?<![\w])[A-Za-z]:[\\/][^${STOP}]*`;
// POSIX: a `/` starts an absolute path only at the start of the text or after whitespace, a quote,
// a parenthesis, a bracket, `=`, `,` or `;`. Any other preceding character (a word character, `-`,
// `+`, `~`, `@`, `%`, `.`, `:` and so on) means the `/` is inside a relative path or a URL.
const POSIX = String.raw`(?<=^|[\s"'\`()\[\]=,;])/(?!/)[^${STOP}]+`;

const ABSOLUTE_PATH_SOURCE = `${UNC}|${DRIVE}|${POSIX}`;

const toSlashes = (p: string): string => p.replace(/\\/g, "/");

const stripTrailingSlashes = (p: string): string => p.replace(/\/+$/, "");

const isAbsolute = (p: string): boolean => /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(p);

const basename = (p: string): string => {
  const segments = toSlashes(p)
    .split("/")
    .filter((s) => s !== "");
  return segments[segments.length - 1] ?? "";
};

export const relativizePath = (projectRoot: string, p: string): string => {
  const path = stripTrailingSlashes(toSlashes(p));
  if (!isAbsolute(p)) {
    return toSlashes(p);
  }
  const root = stripTrailingSlashes(toSlashes(projectRoot));
  if (path === root) {
    return ".";
  }
  if (!p.startsWith("\\\\") && path.startsWith(`${root}/`)) {
    return path.slice(root.length + 1);
  }
  return `${OUTSIDE}/${basename(p)}`;
};

export const scrubAbsolutePaths = (text: string, projectRoot: string): string =>
  text.replace(new RegExp(ABSOLUTE_PATH_SOURCE, "g"), (match) => {
    // Sentence punctuation after a path is not part of it.
    const trailing = /\.+$/.exec(match)?.[0] ?? "";
    const path = trailing === "" ? match : match.slice(0, -trailing.length);
    return relativizePath(projectRoot, path) + trailing;
  });

export const containsAbsolutePath = (text: string): boolean =>
  new RegExp(ABSOLUTE_PATH_SOURCE).test(text);
