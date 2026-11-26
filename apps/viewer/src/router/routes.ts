export type Route =
  | { kind: "landing" }
  | { kind: "demo"; which: "before" | "after" }
  | { kind: "specimen"; mutantId: string }
  | { kind: "hunt" }
  | { kind: "plain" }
  | { kind: "verdict" };

const LANDING: Route = { kind: "landing" };
const MUTANT_PREFIX = "#/mutant/";

function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Maps a URL hash to a route. Pure; anything unknown gives landing. */
export function parseHashRoute(hash: string): Route {
  if (hash.startsWith(MUTANT_PREFIX)) {
    const raw = hash.slice(MUTANT_PREFIX.length);
    return raw === "" ? LANDING : { kind: "specimen", mutantId: decodeId(raw) };
  }
  switch (hash) {
    case "#/demo/before":
      return { kind: "demo", which: "before" };
    case "#/demo/after":
      return { kind: "demo", which: "after" };
    case "#/hunt":
      return { kind: "hunt" };
    case "#/plain":
      return { kind: "plain" };
    case "#/verdict":
      return { kind: "verdict" };
    default:
      return LANDING;
  }
}
