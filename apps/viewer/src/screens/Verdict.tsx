import { useRun } from "../app/run-context.js";
import { ScreenFrame } from "../app/ScreenFrame.js";
import { screenTitle } from "../app/screen-title.js";
import { Headline } from "./verdict/Headline.js";
import { SealGrid } from "./verdict/SealGrid.js";
import { SpeciesLegend } from "./verdict/SpeciesLegend.js";
import { StraysStrip } from "./verdict/StraysStrip.js";
import { WhoKilledPanel } from "./verdict/WhoKilledPanel.js";

/**
 * Verdict screen (6.1, 6.13, 6.14, 10.11). Without a Verdict_File the seals and the
 * who-killed panel are left out and a message says why.
 */
export function Verdict() {
  const { run } = useRun();
  return (
    <ScreenFrame screen="verdict" title={screenTitle("verdict", { run })}>
      {run === undefined ? (
        <p>no run is loaded</p>
      ) : (
        <>
          <Headline model={run} />
          {run.verdict === undefined ? (
            <p>no verdict file was loaded</p>
          ) : (
            <>
              <SealGrid model={run} />
              <WhoKilledPanel model={run} />
            </>
          )}
          <StraysStrip model={run} />
          <SpeciesLegend model={run} />
        </>
      )}
    </ScreenFrame>
  );
}
