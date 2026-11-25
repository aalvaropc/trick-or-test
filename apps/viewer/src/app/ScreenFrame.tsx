import { type ReactNode, useEffect } from "react";
import { useRun } from "./run-context.js";

export type ScreenId = "landing" | "verdict" | "specimen" | "hunt" | "plain";

export const SCREEN_NAMES: Record<ScreenId, string> = {
  landing: "Landing",
  verdict: "Verdict",
  specimen: "Specimen",
  hunt: "Hunt",
  plain: "Plain view",
};

const APP_NAME = "Trick or Test";

/**
 * Shared frame of every screen: the single `<h1>`, the document title and the link to the
 * Plain_View (9.1, 10.11). The Plain_View also links to the Verdict_Screen when a Run is open.
 */
export function ScreenFrame({ screen, children }: { screen: ScreenId; children: ReactNode }) {
  const { run } = useRun();
  const name = SCREEN_NAMES[screen];

  useEffect(() => {
    document.title = `${name} - ${APP_NAME}`;
  }, [name]);

  return (
    <div className="screen-frame">
      <header>
        <h1>{name}</h1>
        <nav aria-label="Screens">
          <a href="#/plain" aria-current={screen === "plain" ? "page" : undefined}>
            {SCREEN_NAMES.plain}
          </a>
          {screen === "plain" && run !== undefined ? (
            <a href="#/verdict">{SCREEN_NAMES.verdict}</a>
          ) : null}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
