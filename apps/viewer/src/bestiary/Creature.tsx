import type { Species } from "trick-or-test/report";
import { type CreatureMutant, creature } from "./creature.js";
import type { CreatureState } from "./state.js";

export type CreatureProps = {
  species: Species;
  seed: string;
  state: CreatureState;
  mutant: CreatureMutant;
};

/**
 * Draws one creature. The only markup injected is the string returned by
 * `creature()` in this render, which escapes every value it embeds.
 */
export function Creature({ species, seed, state, mutant }: CreatureProps) {
  return (
    <span
      className="creature"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the only value is the escaped string from creature() (12.9)
      dangerouslySetInnerHTML={{ __html: creature(species, seed, state, mutant) }}
    />
  );
}
