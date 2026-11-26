import { CreatureLink } from "../../bestiary/CreatureLink.js";
import { selectStrays } from "../../bestiary/counts.js";
import type { RunModel } from "../../loader/run-model.js";

/** Strays: mechanical Mutants without a Criterion (6.10, 6.11). At most 60 are drawn. */
export function StraysStrip({ model }: { model: RunModel }) {
  const { shown, remaining } = selectStrays(model);
  return (
    <section className="strays-strip" aria-labelledby="strays-title">
      <h2 id="strays-title">Strays</h2>
      {shown.length === 0 ? (
        <p>no strays in this run</p>
      ) : (
        <ul className="strays-strip__list">
          {shown.map((m) => (
            <li key={m.id}>
              <CreatureLink
                mutantId={m.id}
                species={m.species}
                state={m.state as "survivor" | "killed" | "in-the-dark" | "ghost"}
                mutant={m}
              />
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 ? (
        <p className="strays-strip__more">
          {remaining} more. <a href="#/plain">See every mutant in the plain view</a>.
        </p>
      ) : null}
    </section>
  );
}
