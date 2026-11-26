import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Species } from "trick-or-test/report";
import {
  getReducedMotion,
  getServerReducedMotion,
  subscribeReducedMotion,
} from "../app/use-reduced-motion.js";
import { type CreatureMutant, creature } from "./creature.js";
import { CREATURE_SIZES, type CreaturePlace } from "./creature-sizes.js";
import type { CreatureState } from "./state.js";
import { withSize } from "./with-size.js";

export type CreatureProps = {
  species: Species;
  seed: string;
  state: CreatureState;
  mutant: CreatureMutant;
  place: CreaturePlace;
};

/** Length of the erase animation; keep equal to the duration in styles/motion.css (10.8). */
const ERASE_MS = 600;

/** True while any creature is erasing: at most one animation runs at a time (10.8). */
let animationRunning = false;

/**
 * Draws one creature. The only markup injected is the string returned by
 * `creature()` in this render, which escapes every value it embeds.
 */
export function Creature({ species, seed, state, mutant, place }: CreatureProps) {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  );
  const [erasing, setErasing] = useState(false);
  const previous = useRef(state);

  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before === state || state !== "killed" || reduced || animationRunning) return;
    animationRunning = true;
    setErasing(true);
    const timer = setTimeout(() => {
      animationRunning = false;
      setErasing(false);
    }, ERASE_MS);
    return () => {
      clearTimeout(timer);
      animationRunning = false;
      setErasing(false);
    };
  }, [state, reduced]);

  return (
    <span
      className={erasing && !reduced ? "creature creature--erasing" : "creature"}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the only value is the escaped string from creature() (12.9)
      dangerouslySetInnerHTML={{
        __html: withSize(creature(species, seed, state, mutant), CREATURE_SIZES[place]),
      }}
    />
  );
}
