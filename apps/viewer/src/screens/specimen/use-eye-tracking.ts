/**
 * Eye tracking for the Specimen screen (7.8, 7.9). No React here: only .tsx files
 * may import react (12.8), so Specimen.tsx calls `trackEyes` from an effect.
 */

/** Largest shift of an eye, in viewBox units. */
export const MAX_EYE_SHIFT = 3;

/** Pointer distance in pixels at which the eyes reach the largest shift. */
const FULL_SHIFT_DISTANCE = 50;

/** Shift of the eyes toward the pointer, from the creature's centre. Pure. */
export function eyeOffset(dx: number, dy: number): readonly [number, number] {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return [0, 0];
  const strength = Math.min(1, distance / FULL_SHIFT_DISTANCE) * MAX_EYE_SHIFT;
  return [(dx / distance) * strength, (dy / distance) * strength];
}

const round = (n: number): number => Number(n.toFixed(2));

/**
 * Turns the eyes inside `container` toward the pointer on each `pointermove`.
 * With `reduced` set it attaches nothing and leaves the eyes in their default
 * position. Returns the cleanup function.
 */
export function trackEyes(
  container: Element,
  reduced: boolean,
  target: Window = window,
): () => void {
  if (reduced) return () => undefined;

  const onMove = (event: Event) => {
    const { clientX, clientY } = event as MouseEvent;
    const rect = container.getBoundingClientRect();
    const [x, y] = eyeOffset(
      clientX - (rect.left + rect.width / 2),
      clientY - (rect.top + rect.height / 2),
    );
    const transform = `translate(${round(x)} ${round(y)})`;
    for (const eye of container.querySelectorAll('[data-kind="eye"]')) {
      eye.setAttribute("transform", transform);
    }
  };

  target.addEventListener("pointermove", onMove);
  return () => {
    target.removeEventListener("pointermove", onMove);
    for (const eye of container.querySelectorAll('[data-kind="eye"]')) {
      eye.removeAttribute("transform");
    }
  };
}
