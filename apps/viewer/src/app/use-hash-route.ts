import { parseHashRoute, type Route } from "../router/routes.js";

/**
 * Store functions over `location.hash` and `hashchange`. The `useHashRoute()` hook that wraps
 * them in `useSyncExternalStore` lives in `run-context.tsx`, because only .tsx files may import
 * react (12.8). Nothing is persisted: the URL hash is the only route state (11.9).
 */
export function subscribeHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function getHash(): string {
  return window.location.hash;
}

export function getServerHash(): string {
  return "";
}

export function routeOfHash(hash: string): Route {
  return parseHashRoute(hash);
}
