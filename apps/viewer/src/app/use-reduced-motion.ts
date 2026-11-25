/**
 * Store functions over `matchMedia("(prefers-reduced-motion: reduce)")`.
 * Components call `useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getServerReducedMotion)`.
 * They live here, without React, because only .tsx files may import react (12.8).
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function query(): MediaQueryList | null {
  return typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(QUERY) : null;
}

export function getReducedMotion(): boolean {
  return query()?.matches ?? false;
}

export function getServerReducedMotion(): boolean {
  return false;
}

export function subscribeReducedMotion(onChange: () => void): () => void {
  const list = query();
  list?.addEventListener("change", onChange);
  return () => list?.removeEventListener("change", onChange);
}
