import type { Verdict as VerdictFile } from "trick-or-test/report";
import { useRun } from "../app/run-context.js";
import { ScreenFrame } from "../app/ScreenFrame.js";
import { screenTitle } from "../app/screen-title.js";
import { Headline } from "./verdict/Headline.js";
import { SealGrid } from "./verdict/SealGrid.js";
import { SpeciesLegend } from "./verdict/SpeciesLegend.js";
import { StraysStrip } from "./verdict/StraysStrip.js";
import { WhoKilledPanel } from "./verdict/WhoKilledPanel.js";

/** The facts the Verdict_File holds about the run; absent or blank ones are left out (13.9). */
function runFacts(verdict: VerdictFile | undefined): string[] {
  const m: Partial<VerdictFile["metadata"]> | undefined = verdict?.metadata;
  if (m === undefined) return [];
  const facts: [string, string | undefined][] = [
    ["engine", m.engineVersion],
    ["stryker", m.strykerVersion],
    ["vitest", m.vitestVersion],
    ["typescript", m.typescriptVersion],
    ["node", m.nodeVersion],
    ["date", m.timestamp?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? m.timestamp],
  ];
  return facts.flatMap(([label, value]) =>
    typeof value === "string" && value.trim() !== "" ? [`${label} ${value}`] : [],
  );
}

/**
 * Verdict screen (6.1, 6.13, 6.14, 10.11, 13.9). Without a Verdict_
 * File the seals and the who-killed panel are left out and a message says why.
 */
export function Verdict() {
  const { run } = useRun();
  return (
    <ScreenFrame screen="verdict" title={screenTitle("verdict", { run })}>
      {run === undefined ? (
        <p>no run is loaded</p>
      ) : (
        <>
          <div className="run-bar">
            <span className="run-bar__mark">Trick or Test</span>
            {runFacts(run.verdict).map((fact) => (
              <span key={fact} className="run-bar__fact">
                {fact}
              </span>
            ))}
          </div>
          <p className="verdict__lead">
            Each creature below is a deliberate bug. A survivor is a bug that every test let
            through. A seal shows whether a broken promise in the spec would be noticed.
          </p>
          <Headline model={run} />
          {run.verdict === undefined ? (
            <p>no verdict file was loaded</p>
          ) : (
            <div className="verdict__columns">
              <div className="verdict__seals">
                <SealGrid model={run} />
              </div>
              <WhoKilledPanel model={run} />
            </div>
          )}
          <div className="verdict__actions">
            <a className="button button--primary" href="#/hunt">
              Release the hunt
            </a>
            <a className="button button--secondary" href="#/plain">
              Plain table view
            </a>
          </div>
          <StraysStrip model={run} />
          <SpeciesLegend model={run} />
        </>
      )}
    </ScreenFrame>
  );
}
