import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { RunProvider, useHashRoute, useRun } from "./app/run-context.js";
import { fetchDemoRun } from "./loader/fetch-demo-run.js";
import { buildRunModel } from "./loader/run-model.js";
import type { LoadError } from "./loader/types.js";
import { Hunt } from "./screens/Hunt.js";
import { Landing } from "./screens/Landing.js";
import { PlainView } from "./screens/PlainView.js";
import { Specimen } from "./screens/Specimen.js";
import { Verdict } from "./screens/Verdict.js";

type BoundaryState = { failed: boolean };

/** Keeps the app running when a screen fails to render (12.14). */
class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The fallback is the report; nothing is logged or sent anywhere.
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="load-error" role="alert">
        <p>This screen could not be shown.</p>
        <p>
          <a href="#/">Back to the start</a>
        </p>
      </section>
    );
  }
}

type DemoFailure = { which: "before" | "after"; error: LoadError };

function Shell() {
  const route = useHashRoute();
  const { run, applyLoad } = useRun();
  const [failure, setFailure] = useState<DemoFailure | undefined>(undefined);
  const demo = route.kind === "demo" ? route.which : undefined;

  // The effect starts on first open and again on every remount, so a reload fetches again (2.8).
  useEffect(() => {
    if (demo === undefined) return;
    let current = true;
    setFailure(undefined);
    void fetchDemoRun(demo).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setFailure({ which: demo, error: result.error });
        return;
      }
      applyLoad({ ok: true, value: buildRunModel(result.value) });
      window.location.hash = "#/verdict";
    });
    return () => {
      current = false;
    };
  }, [demo, applyLoad]);

  const screen = (): ReactNode => {
    switch (route.kind) {
      case "demo":
        return failure !== undefined && failure.which === route.which ? (
          <Landing loadError={failure.error} />
        ) : (
          <Landing notice="Opening the demo run." />
        );
      case "landing":
        return <Landing />;
      case "specimen":
        if (run === undefined) return <Landing notice="no run is open" />;
        if (!run.mutants.some((mutant) => mutant.id === route.mutantId)) {
          return <Landing notice="mutant not found" />;
        }
        return <Specimen mutantId={route.mutantId} />;
      case "verdict":
        return run === undefined ? <Landing notice="no run is open" /> : <Verdict />;
      case "hunt":
        return run === undefined ? <Landing notice="no run is open" /> : <Hunt />;
      case "plain":
        return run === undefined ? <Landing notice="no run is open" /> : <PlainView />;
    }
  };

  // The key resets a failed boundary when the route changes.
  return <ErrorBoundary key={JSON.stringify(route)}>{screen()}</ErrorBoundary>;
}

export function App() {
  return (
    <RunProvider>
      <Shell />
    </RunProvider>
  );
}
