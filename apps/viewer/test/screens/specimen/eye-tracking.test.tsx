import { cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import type { MutationTestingReport, Verdict } from "trick-or-test/report";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunProvider, useRun } from "../../../src/app/run-context.js";
import { buildRunModel } from "../../../src/loader/run-model.js";
import { Specimen } from "../../../src/screens/Specimen.js";

/** A one-mutant surviving run, so the creature has lit eyes. */
const makeRun = () => {
  const report = {
    schemaVersion: "2",
    thresholds: { high: 80, low: 60 },
    files: {
      "src/cmp.ts": {
        language: "typescript",
        source: "const x = a >= b;\n",
        mutants: [
          {
            id: "m1",
            mutatorName: "Oathbreaker",
            location: { start: { line: 1, column: 11 }, end: { line: 1, column: 17 } },
            status: "Survived",
            replacement: "a > b",
            species: "Oathbreaker",
            requirement: "2.1",
          },
        ],
      },
    },
  } as unknown as MutationTestingReport;
  const verdict = {
    coverage: [{ criterion: "2.1", status: "unguarded" }],
    mutants: [
      {
        id: "m1",
        species: "Oathbreaker",
        status: "Survived",
        requirement: "2.1",
        killingTests: [],
      },
    ],
    witnesses: {},
    ignoreStaticRetried: false,
    metadata: {
      gitCommit: "abc1234",
      seed: 1,
      engineVersion: "0.0.0",
      nodeVersion: "v24.0.0",
      strykerVersion: "9.0.0",
      vitestVersion: "4.0.0",
      typescriptVersion: "6.0.0",
      timestamp: "2026-01-03T00:00:00.000Z",
    },
  } as unknown as Verdict;
  return buildRunModel({ report, verdict, history: [], ignoredVerdictEntryCount: 0 });
};

function Loader({ model }: { model: ReturnType<typeof makeRun> }) {
  const { applyLoad } = useRun();
  useEffect(() => {
    applyLoad({ ok: true, value: model });
  }, [applyLoad, model]);
  return null;
}

const open = () => {
  const model = makeRun();
  return render(
    <RunProvider>
      <Loader model={model} />
      <Specimen mutantId="m1" />
    </RunProvider>,
  );
};

const move = (clientX: number, clientY: number) => {
  window.dispatchEvent(new MouseEvent("pointermove", { clientX, clientY }));
};

/** Pretends the user asked for reduced motion. */
const preferReducedMotion = () => {
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: true,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Specimen eye tracking", () => {
  it("7.8 a pointer move turns the eyes toward the pointer", async () => {
    const { container } = open();
    const eyes = container.querySelectorAll('[data-kind="eye"]');
    expect(eyes.length).toBeGreaterThan(0);
    for (const eye of eyes) expect(eye.getAttribute("transform")).toBeNull();

    move(100, 0);

    for (const eye of container.querySelectorAll('[data-kind="eye"]')) {
      expect(eye.getAttribute("transform")).toBe("translate(3 0)");
    }
  });

  it("7.8 a second pointer move updates the eyes again", () => {
    const { container } = open();
    move(100, 0);
    move(0, 100);

    for (const eye of container.querySelectorAll('[data-kind="eye"]')) {
      expect(eye.getAttribute("transform")).toBe("translate(0 3)");
    }
  });

  it("7.8 the listener is removed when the screen closes", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = open();
    unmount();
    expect(remove.mock.calls.some(([type]) => type === "pointermove")).toBe(true);
  });

  it("7.9 with reduced motion the eyes stay at their default position", () => {
    preferReducedMotion();
    const { container } = open();
    move(100, 0);

    const eyes = container.querySelectorAll('[data-kind="eye"]');
    expect(eyes.length).toBeGreaterThan(0);
    for (const eye of eyes) expect(eye.getAttribute("transform")).toBeNull();
  });

  it("7.9 with reduced motion no pointermove listener is added", () => {
    preferReducedMotion();
    const add = vi.spyOn(window, "addEventListener");
    open();
    expect(add.mock.calls.some(([type]) => type === "pointermove")).toBe(false);
  });
});
