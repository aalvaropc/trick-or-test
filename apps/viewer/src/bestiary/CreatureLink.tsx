import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import type { Species } from "trick-or-test/report";
import { Creature } from "./Creature.js";
import type { CreatureMutant } from "./creature.js";
import type { CreaturePlace } from "./creature-sizes.js";
import type { CreatureState } from "./state.js";

export type CreatureLinkProps = {
  place: CreaturePlace;
  mutantId: string;
  species: Species;
  state: CreatureState;
  mutant: CreatureMutant;
};

const STATE_LABEL: Record<CreatureState, string> = {
  survivor: "survived",
  killed: "killed",
  "in-the-dark": "no test runs this code",
  ghost: "ghost, not counted",
};

/** One small marker per state. The shapes differ, so state never rests on colour alone. */
function StateShape({ state }: { state: CreatureState }) {
  const common = { stroke: "currentColor", strokeWidth: 1.5 };
  let shape: ReactNode;
  switch (state) {
    case "survivor":
      shape = <polygon points="7,1 13,7 7,13 1,7" fill="currentColor" {...common} />;
      break;
    case "killed":
      shape = <path d="M2 2 L12 12 M12 2 L2 12" fill="none" {...common} />;
      break;
    case "in-the-dark":
      shape = <rect x="2" y="2" width="10" height="10" fill="currentColor" {...common} />;
      break;
    case "ghost":
      shape = <circle cx="7" cy="7" r="5" fill="none" strokeDasharray="3 2" {...common} />;
      break;
  }
  return (
    <svg
      className="creature-link__shape"
      data-state-shape={state}
      viewBox="0 0 14 14"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      {shape}
    </svg>
  );
}

export function mutantHash(mutantId: string): string {
  return `#/mutant/${encodeURIComponent(mutantId)}`;
}

/** A focusable creature that opens its Specimen on click, tap, Enter or Space. */
export function CreatureLink({ mutantId, species, state, mutant, place }: CreatureLinkProps) {
  const hash = mutantHash(mutantId);

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.location.hash = hash;
  };

  // Enter and click are native for a link; Space is not, so handle it here.
  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      window.location.hash = hash;
    }
  };

  return (
    <a className="creature-link" href={hash} onClick={open} onKeyDown={onKeyDown}>
      <Creature species={species} seed={mutantId} state={state} mutant={mutant} place={place} />
      <span className="creature-link__label">
        <StateShape state={state} />
        <span>{STATE_LABEL[state]}</span>
      </span>
    </a>
  );
}
