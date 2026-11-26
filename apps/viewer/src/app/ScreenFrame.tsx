import { type ReactNode, useEffect } from "react";
import { useRun } from "./run-context.js";

export type ScreenId = "landing" | "verdict" | "specimen" | "hunt" | "plain";

/** Internal screen names. They feed the document title only, never the `<h1>` (13.6). */
export const SCREEN_NAMES: Record<ScreenId, string> = {
  landing: "Landing",
  verdict: "Verdict",
  specimen: "Specimen",
  hunt: "Hunt",
  plain: "Plain view",
};

const APP_NAME = "Trick or Test";

/**
 * Page_Frame of every screen (13.4, 13.5): the product mark, the single `<h1>` with the
 * Screen_Title, the navigation links and a bottom rule. The document title keeps the screen name
 * (10.11). The Plain_View also links to the Verdict_Screen when a Run is open.
 */
export function ScreenFrame({
  screen,
  title,
  intro,
  children,
}: {
  screen: ScreenId;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const { run } = useRun();
  const name = SCREEN_NAMES[screen];

  useEffect(() => {
    document.title = `${name} - ${APP_NAME}`;
  }, [name]);

  return (
    <div className="page" data-screen={screen}>
      <header className="page__header">
        <p className="page__mark">{APP_NAME}</p>
        <h1 className="page__title">{title}</h1>
        <nav className="page__nav" aria-label="Screens">
          <a href="#/plain" aria-current={screen === "plain" ? "page" : undefined}>
            {SCREEN_NAMES.plain}
          </a>
          {screen === "plain" && run !== undefined ? (
            <a href="#/verdict">{SCREEN_NAMES.verdict}</a>
          ) : null}
        </nav>
        {intro}
      </header>
      <main className="page__main">{children}</main>
    </div>
  );
}
