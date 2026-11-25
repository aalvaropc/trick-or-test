import { useEffect, useState } from "react";
import { FontLicences } from "../app/FontLicences.js";
import { LoadErrorView } from "../app/LoadErrorView.js";
import { ScreenFrame } from "../app/ScreenFrame.js";
import { computeHeadlineCounts } from "../bestiary/counts.js";
import { fetchDemoRun } from "../loader/fetch-demo-run.js";
import { buildRunModel } from "../loader/run-model.js";
import type { LoadError } from "../loader/types.js";
import { DropZone } from "./landing/DropZone.js";

/** How long the pitch waits for the before Demo_Run before it shows no numbers (3.2). */
export const DEMO_WAIT_MS = 5_000;

type Numbers = { survivors: number; unguarded: number };

type Demo =
  | { state: "loading" }
  | { state: "ready"; numbers: Numbers }
  | { state: "none"; error?: LoadError };

/**
 * Landing screen (3.1 to 3.4, 3.6): the pitch with numbers taken from the before Demo_Run, two
 * demo links, the privacy statement, the drop zone and the font licences. A Demo_Run that fails,
 * is invalid or takes longer than DEMO_WAIT_MS leaves the pitch without numbers.
 */
export function Landing() {
  const [demo, setDemo] = useState<Demo>({ state: "loading" });

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      if (!current) return;
      setDemo((previous) => (previous.state === "loading" ? { state: "none" } : previous));
    }, DEMO_WAIT_MS);
    void fetchDemoRun("before").then((result) => {
      if (!current) return;
      clearTimeout(timer);
      if (!result.ok) {
        setDemo({ state: "none", error: result.error });
        return;
      }
      const counts = computeHeadlineCounts(buildRunModel(result.value));
      setDemo((previous) => {
        if (previous.state === "none" && previous.error === undefined) return previous;
        if (counts.unguardedCriteria === undefined) return { state: "none" };
        return {
          state: "ready",
          numbers: { survivors: counts.survivingSpecMutants, unguarded: counts.unguardedCriteria },
        };
      });
    });
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, []);

  const error = demo.state === "none" ? demo.error : undefined;

  return (
    <ScreenFrame screen="landing">
      <p data-testid="pitch">
        {demo.state === "ready" ? (
          <>
            <strong data-testid="pitch-survivors">{demo.numbers.survivors}</strong> monsters bred
            from the spec survive the tests, and{" "}
            <strong data-testid="pitch-unguarded">{demo.numbers.unguarded}</strong> requirements
            stay unguarded.
          </>
        ) : (
          "Monsters bred from the spec show which promises the tests would never notice."
        )}
      </p>
      <nav aria-label="Demo runs">
        <a href="#/demo/before">before the hunt</a>
        <a href="#/demo/after">after the hunt</a>
      </nav>
      <p>Your files never leave the browser.</p>
      {error === undefined ? null : <LoadErrorView error={error} />}
      <DropZone />
      <FontLicences />
    </ScreenFrame>
  );
}
