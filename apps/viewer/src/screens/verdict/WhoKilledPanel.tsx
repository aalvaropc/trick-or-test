import type { KillClass } from "trick-or-test/report";
import { CreatureLink } from "../../bestiary/CreatureLink.js";
import { computeKillClassCounts } from "../../bestiary/counts.js";
import type { Mutant, RunModel } from "../../loader/run-model.js";

const GROUPS: readonly { killClass: KillClass; label: string }[] = [
  { killClass: "examples-only", label: "examples only" },
  { killClass: "properties-only", label: "properties only" },
  { killClass: "both", label: "both" },
  { killClass: "unattributed", label: "unattributed" },
];

/** Killed, counted Mutants of one Kill_Class, in report order. */
const membersOf = (model: RunModel, killClass: KillClass): Mutant[] =>
  model.mutants.filter((m) => m.state === "killed" && m.verdictEntry?.killClass === killClass);

/** Who killed them (6.8, 6.9, 6.15): four groups, each with a count and a list of its Mutants. */
export function WhoKilledPanel({ model }: { model: RunModel }) {
  const counts = computeKillClassCounts(model);
  return (
    <section className="who-killed" aria-labelledby="who-killed-title">
      <h2 id="who-killed-title">Who killed them</h2>
      <div className="who-killed__groups">
        {GROUPS.map(({ killClass, label }) => {
          const members = membersOf(model, killClass);
          return (
            <details
              key={killClass}
              className="who-killed__group"
              data-testid={`kill-group-${killClass}`}
            >
              <summary>
                <span>{label}</span> <span data-testid="kill-count">{counts[killClass]}</span>
              </summary>
              {members.length === 0 ? (
                <p>no mutants in this group</p>
              ) : (
                <ul className="who-killed__list">
                  {members.map((m) => (
                    <li key={m.id}>
                      <CreatureLink
                        mutantId={m.id}
                        species={m.species}
                        state="killed"
                        mutant={m}
                        place="panelList"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
