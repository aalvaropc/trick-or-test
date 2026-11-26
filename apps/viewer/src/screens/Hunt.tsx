import { useRun } from "../app/run-context.js";
import { ScreenFrame } from "../app/ScreenFrame.js";
import { screenTitle } from "../app/screen-title.js";
import { CreatureLink } from "../bestiary/CreatureLink.js";
import { buildTimeline, type TimelineEntry } from "../hunt/timeline.js";
import type { Mutant } from "../loader/run-model.js";

/**
 * One blocked write attempt. Minimal local type: the Lock_Log format belongs to the
 * agent-guard spec.
 */
export type LockLogEntry = { time: string; file: string };

type Item =
  | { kind: "run"; at: number; entry: TimelineEntry }
  | { kind: "blocked"; at: number; entry: LockLogEntry };

/** Runs and blocked attempts by time ascending; on equal or unparseable times the input order is kept. */
function mergeItems(timeline: TimelineEntry[], lockLog: readonly LockLogEntry[]): Item[] {
  const items: Item[] = [
    ...timeline.map((entry): Item => ({ kind: "run", at: Date.parse(entry.time), entry })),
    ...lockLog.map((entry): Item => ({ kind: "blocked", at: Date.parse(entry.time), entry })),
  ];
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const d = a.item.at - b.item.at;
      return Number.isNaN(d) || d === 0 ? a.index - b.index : d;
    })
    .map(({ item }) => item);
}

/** A killed id that the run knows is a creature. Anything else is shown as text (8.5). */
function Killed({ id, mutant }: { id: string; mutant: Mutant | undefined }) {
  if (mutant === undefined || mutant.state === "not-counted") return <code>{id}</code>;
  return (
    <CreatureLink mutantId={id} species={mutant.species} state={mutant.state} mutant={mutant} />
  );
}

function RunEntry({ entry, mutants }: { entry: TimelineEntry; mutants: Map<string, Mutant> }) {
  return (
    <li className="hunt__entry">
      <p>
        <time className="hunt__time" dateTime={entry.time}>
          {entry.time}
        </time>{" "}
        <code className="hunt__commit">{entry.gitCommit}</code>
      </p>
      <p className="hunt__survivors">
        survivors after this run: <span className="hunt__survivors-count">{entry.survivors}</span>
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
  );
}

/**
 * Hunt screen: a static ordered list of runs, oldest first (8.1 to 8.7, 8.8 to 8.12).
 * It has no animation. An empty history list means that no History_File was loaded.
 * Blocked write attempts from an optional Lock_Log sit on the timeline in `--amber` (8.6).
 */
export function Hunt({ lockLog = [] }: { lockLog?: readonly LockLogEntry[] }) {
  const { run } = useRun();
  const timeline = run === undefined ? [] : buildTimeline(run.history);
  const mutants = new Map<string, Mutant>();
  for (const m of run?.mutants ?? []) mutants.set(m.id, m);
  const items = mergeItems(timeline, lockLog);

  return (
    <ScreenFrame screen="hunt" title={screenTitle("hunt", { run })}>
      {timeline.length === 0 ? (
        <p>no history was loaded</p>
      ) : (
        <ol className="hunt__timeline">
          {items.map((item, index) =>
            item.kind === "blocked" ? (
              <li
                // Records can share a time, so the position is part of the key.
                // biome-ignore lint/suspicious/noArrayIndexKey: a static list that is never reordered
                key={`${index}-blocked-${item.entry.time}`}
                className="hunt__blocked"
                style={{ color: "var(--amber)" }}
              >
                <time dateTime={item.entry.time}>{item.entry.time}</time> <strong>blocked</strong>{" "}
                <code>{item.entry.file}</code>
              </li>
            ) : (
              <RunEntry
                // biome-ignore lint/suspicious/noArrayIndexKey: a static list that is never reordered
                key={`${index}-${item.entry.time}-${item.entry.gitCommit}`}
                entry={item.entry}
                mutants={mutants}
              />
            ),
          )}
        </ol>
      )}
    </ScreenFrame>
  );
}
