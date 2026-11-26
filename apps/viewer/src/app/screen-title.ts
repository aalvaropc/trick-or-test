import { computeHeadlineCounts } from "../bestiary/counts.js";
import type { RunModel } from "../loader/run-model.js";

export type ScreenName = "landing" | "verdict" | "specimen" | "hunt" | "plain";

export type ScreenTitleInput = {
  run?: RunModel | undefined;
  mutantId?: string | undefined;
};

export const LANDING_TITLE = "A Bestiary of Bugs Your Tests Never Noticed";

/** The Screen_Title of each screen, in the product's words (13.6). Pure. */
export function screenTitle(screen: ScreenName, input: ScreenTitleInput): string {
  switch (screen) {
    case "landing":
      return LANDING_TITLE;
    case "verdict": {
      const { run } = input;
      if (run === undefined || run.verdict === undefined) return "Mutants that survived the tests";
      const n = computeHeadlineCounts(run).survivingSpecMutants;
      if (n === 0) return "No monster disagrees";
      return n === 1 ? "1 monster disagrees" : `${n} monsters disagree`;
    }
    case "specimen": {
      const mutant = input.run?.mutants.find((m) => m.id === input.mutantId);
      return mutant === undefined ? "Specimen not found" : `The ${mutant.species}`;
    }
    case "hunt":
      return "The hunt";
    case "plain":
      return "Plain view";
  }
}
