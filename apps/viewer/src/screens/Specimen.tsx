import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRun } from "../app/run-context.js";
import { ScreenFrame } from "../app/ScreenFrame.js";
import { screenTitle } from "../app/screen-title.js";
import {
  getReducedMotion,
  getServerReducedMotion,
  subscribeReducedMotion,
} from "../app/use-reduced-motion.js";
import { Creature } from "../bestiary/Creature.js";
import {
  buildSpecimenView,
  type OutcomeView,
  type SpecimenView,
  type TestList,
} from "./specimen/specimen-view.js";
import { trackEyes } from "./specimen/use-eye-tracking.js";

const OUTCOME_LABEL: Record<OutcomeView["kind"], string> = {
  value: "value",
  error: "throws",
  timeout: "timed out",
  "no-outcome": "no outcome",
};

function Tests({ list, id }: { list: TestList; id: string }) {
  return (
    <>
      <ul className="specimen__tests" aria-labelledby={id}>
        {list.names.map((name, i) => (
          // Names can repeat, so the index is part of the key.
          // biome-ignore lint/suspicious/noArrayIndexKey: a static list that is never reordered
          <li key={`${i}-${name}`}>
            <code>{name}</code>
          </li>
        ))}
      </ul>
      {list.hidden > 0 ? <p>{list.hidden} more not shown.</p> : null}
    </>
  );
}

function Outcome({ outcome }: { outcome: OutcomeView }) {
  return (
    <span className="specimen__outcome" data-outcome-kind={outcome.kind}>
      {OUTCOME_LABEL[outcome.kind]}: <code>{outcome.text}</code>
    </span>
  );
}

function Details({ view }: { view: SpecimenView }) {
  const { change, criterion, witness, killedBy, coveredBy, noTestRuns } = view;
  return (
    <>
      <section aria-labelledby="specimen-change">
        <h2 id="specimen-change">Code change</h2>
        <p className="specimen__where">
          <code>{change.file}</code> line <span>{change.line}</span>
        </p>
        {change.original === undefined ? (
          <>
            <p>original line unavailable</p>
            {change.replacement === undefined ? null : (
              <p>
                replacement: <code>{change.replacement}</code>
              </p>
            )}
          </>
        ) : (
          <>
            <p>original</p>
            <pre data-line="original">{change.original}</pre>
            <p>mutated</p>
            {change.mutated === undefined ? (
              <p>mutated line unavailable</p>
            ) : (
              <pre data-line="mutated">{change.mutated}</pre>
            )}
          </>
        )}
      </section>

      {criterion === undefined ? null : (
        <section aria-labelledby="specimen-criterion">
          <h2 id="specimen-criterion">Criterion</h2>
          <p>
            <span className="specimen__criterion-id">{criterion.id}</span>
          </p>
          <p>{criterion.text}</p>
        </section>
      )}

      {witness === undefined ? null : (
        <section aria-labelledby="specimen-witness">
          <h2 id="specimen-witness">Witness</h2>
          <dl>
            <dt>input</dt>
            <dd>
              <code>{witness.input}</code>
            </dd>
            <dt>{witness.expected.kind === "error" ? "expected error" : "expected value"}</dt>
            <dd>
              <code>{witness.expected.text}</code>
            </dd>
            {witness.mutated === undefined ? null : (
              <>
                <dt>mutant gives</dt>
                <dd>
                  <Outcome outcome={witness.mutated} />
                </dd>
              </>
            )}
          </dl>
        </section>
      )}

      {killedBy === undefined ? null : (
        <section aria-labelledby="specimen-killers">
          <h2 id="specimen-killers">Killed by</h2>
          {killedBy.tests.names.length > 0 ? (
            <Tests list={killedBy.tests} id="specimen-killers" />
          ) : (
            <p>
              {killedBy.timedOut
                ? "the suite timed out with this mutant"
                : "no killing test names were recorded"}
            </p>
          )}
          {killedBy.killClass === undefined ? null : (
            <p>
              kill class: <span className="specimen__kill-class">{killedBy.killClass}</span>
            </p>
          )}
        </section>
      )}

      {coveredBy === undefined ? null : (
        <section aria-labelledby="specimen-covered">
          <h2 id="specimen-covered">Ran this code without failing</h2>
          <Tests list={coveredBy} id="specimen-covered" />
        </section>
      )}

      {noTestRuns ? <p>no test runs this code</p> : null}
    </>
  );
}

/** Specimen screen: one Mutant in detail (7.1 to 7.12). */
export function Specimen({ mutantId }: { mutantId: string }) {
  const { run } = useRun();
  const view = run === undefined ? undefined : buildSpecimenView(run, mutantId);
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  );
  const creatureBox = useRef<HTMLDivElement>(null);
  const hasCreature = view?.creatureState !== undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: hasCreature re-attaches the tracking once the creature box exists
  useEffect(() => {
    const box = creatureBox.current;
    if (box === null) return;
    return trackEyes(box, reduced);
  }, [reduced, hasCreature]);

  return (
    <ScreenFrame screen="specimen" title={screenTitle("specimen", { run, mutantId })}>
      {view === undefined ? (
        <>
          <p>
            {run === undefined
              ? "no run is loaded."
              : `no mutant with the id "${mutantId}" is in this run.`}
          </p>
          <p>
            <a href="#/verdict">Back to the verdict</a>
          </p>
        </>
      ) : (
        <>
          <div className="specimen__creature" ref={creatureBox}>
            {view.creatureState === undefined ? null : (
              <Creature
                species={view.mutant.species}
                seed={view.mutant.id}
                state={view.creatureState}
                mutant={view.mutant}
                place="specimenPlate"
              />
            )}
          </div>
          <dl className="specimen__facts">
            <dt>species</dt>
            <dd className="specimen__species">{view.mutant.species}</dd>
            <dt>state</dt>
            <dd className="specimen__state">{view.stateLabel}</dd>
            <dt>mutant id</dt>
            <dd>
              <code>{view.mutant.id}</code>
            </dd>
          </dl>
          <Details view={view} />
        </>
      )}
    </ScreenFrame>
  );
}
