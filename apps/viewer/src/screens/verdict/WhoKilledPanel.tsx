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
  const total = GROUPS.reduce((sum, g) => sum + counts[g.killClass], 0);
  const share = (killClass: KillClass): number =>
    total === 0 ? 0 : Math.round((counts[killClass] / total) * 10000) / 100;
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
                <span className="who-killed__line">
                  <span>{label}</span> <span data-testid="kill-count">{counts[killClass]}</span>
                </span>
                <span className="who-killed__bar" aria-hidden="true">
                  {/* runtime-style: the width is the group's share of the killed mutants, known only at run time */}
                  <span className="who-killed__fill" style={{ width: `${share(killClass)}%` }} />
                </span>
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
