import { computeSpeciesLegend } from "../../bestiary/counts.js";
import type { RunModel } from "../../loader/run-model.js";

/** Species legend: one entry per Species present in the Run (6.12). */
export function SpeciesLegend({ model }: { model: RunModel }) {
  const entries = computeSpeciesLegend(model);
  return (
    <section className="species-legend" aria-labelledby="species-legend-title">
      <h2 id="species-legend-title">Species</h2>
      {entries.length === 0 ? (
        <p>no species in this run</p>
      ) : (
        <ul className="species-legend__list">
          {entries.map((e) => (
            <li key={e.species} className="species-legend__entry">
              <h3>{e.species}</h3>
              <p>{e.bodyDescription}</p>
              <p>{e.mutationType}</p>
              <p className="species-legend__count">
                {e.count} {e.count === 1 ? "mutant" : "mutants"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
