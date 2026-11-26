import { useRun } from "../app/run-context.js";
import { ScreenFrame } from "../app/ScreenFrame.js";
import { CreatureLink } from "../bestiary/CreatureLink.js";
import { buildTimeline } from "../hunt/timeline.js";
import type { Mutant } from "../loader/run-model.js";

/** A killed id that the run knows is a creature. Anything else is shown as text (8.5). */
function Killed({ id, mutant }: { id: string; mutant: Mutant | undefined }) {
  if (mutant === undefined || mutant.state === "not-counted") return <code>{id}</code>;
  return (
    <CreatureLink mutantId={id} species={mutant.species} state={mutant.state} mutant={mutant} />
  );
}

/**
 * Hunt screen: a static ordered list of runs, oldest first (8.1 to 8.5, 8.8 to 8.12).
 * It has no animation. An empty history list means that no History_File was loaded.
 */
export function Hunt() {
  const { run } = useRun();
  const timeline = run === undefined ? [] : buildTimeline(run.history);
  const mutants = new Map<string, Mutant>();
  for (const m of run?.mutants ?? []) mutants.set(m.id, m);

  return (
    <ScreenFrame screen="hunt">
      {timeline.length === 0 ? (
        <p>no history was loaded</p>
      ) : (
        <ol className="hunt__timeline">
          {timeline.map((entry, index) => (
            // Records can share a time and a commit, so the position is part of the key.
            // biome-ignore lint/suspicious/noArrayIndexKey: a static list that is never reordered
            <li key={`${index}-${entry.time}-${entry.gitCommit}`} className="hunt__entry">
              <p>
                <time className="hunt__time" dateTime={entry.time}>
                  {entry.time}
                </time>{" "}
                <code className="hunt__commit">{entry.gitCommit}</code>
              </p>
              <p className="hunt__survivors">
                survivors after this run:{" "}
                <span className="hunt__survivors-count">{entry.survivors}</span>
              </p>
              {entry.newlyKilledIds.length === 0 ? (
                <p>no new kills</p>
              ) : (
                <ul className="hunt__killed" aria-label="Newly killed">
                  {entry.newlyKilledIds.map((id) => (
                    <li key={id}>
                      <Killed id={id} mutant={mutants.get(id)} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </ScreenFrame>
  );
}
