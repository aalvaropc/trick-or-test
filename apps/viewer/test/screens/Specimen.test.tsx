import { cleanup, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import type { MutationTestingReport, Verdict } from "trick-or-test/report";
import { afterEach, describe, expect, it } from "vitest";
import { RunProvider, useRun } from "../../src/app/run-context.js";
import { buildRunModel } from "../../src/loader/run-model.js";
import { Specimen } from "../../src/screens/Specimen.js";

type Status = "Survived" | "Killed" | "Timeout" | "NoCoverage" | "Ignored";
type Outcome = NonNullable<Verdict["witnesses"][never]["mutatedOutcome"]>;

type Options = {
  status?: Status;
  /** Source text of the file. An empty string means the report holds none. */
  source?: string;
  requirement?: string | undefined;
  criterionText?: string | undefined;
  /** Whether the verdict lists the criterion at all. */
  listCriterion?: boolean;
  killingTests?: string[];
  killClass?: "examples-only" | "properties-only" | "both" | "unattributed";
  coveredBy?: string[];
  mutatedOutcome?: Outcome | undefined;
  withWitness?: boolean;
};

const SOURCE = "const x = a >= b;\n";

/** A one-mutant run, `m1`, built from hand-written values. */
const makeRun = (o: Options = {}) => {
  const status = o.status ?? "Survived";
  const requirement = "requirement" in o ? o.requirement : "2.1";
  const report = {
    schemaVersion: "2",
    thresholds: { high: 80, low: 60 },
    files: {
      "src/cmp.ts": {
        language: "typescript",
        source: o.source ?? SOURCE,
        mutants: [
          {
            id: "m1",
            mutatorName: requirement === undefined ? "EqualityOperator" : "Oathbreaker",
            location: { start: { line: 1, column: 11 }, end: { line: 1, column: 17 } },
            status,
            replacement: "a > b",
            ...(o.killingTests !== undefined && status === "Killed"
              ? { killedBy: o.killingTests }
              : {}),
            ...(o.coveredBy === undefined ? {} : { coveredBy: o.coveredBy }),
            ...(requirement === undefined ? {} : { species: "Oathbreaker", requirement }),
          },
        ],
      },
    },
  } as unknown as MutationTestingReport;

  const verdict = {
    coverage:
      o.listCriterion === false || requirement === undefined
        ? []
        : [
            {
              criterion: requirement,
              status: "unguarded",
              ...(o.criterionText === undefined ? {} : { text: o.criterionText }),
            },
          ],
    // The engine has no NoCoverage status, so that mutant has no verdict entry.
    mutants:
      status === "NoCoverage"
        ? []
        : [
            {
              id: "m1",
              species: requirement === undefined ? "Borderling" : "Oathbreaker",
              status,
              ...(requirement === undefined ? {} : { requirement }),
              killingTests: o.killingTests ?? [],
              ...(o.killClass === undefined ? {} : { killClass: o.killClass }),
            },
          ],
    witnesses: o.withWitness
      ? {
          m1: {
            from: "src/cmp.ts",
            export: "atLeast",
            args: [10, 10],
            expected: true,
            ...(o.mutatedOutcome === undefined ? {} : { mutatedOutcome: o.mutatedOutcome }),
          },
        }
      : {},
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

const open = (o: Options = {}, id = "m1") => {
  const model = makeRun(o);
  return render(
    <RunProvider>
      <Loader model={model} />
      <Specimen mutantId={id} />
    </RunProvider>,
  );
};

const section = (name: string): HTMLElement => {
  const heading = screen.getByRole("heading", { name });
  const region = heading.closest("section");
  if (region === null) throw new Error(`no section for ${name}`);
  return region;
};

afterEach(cleanup);

describe("Specimen", () => {
  it("7.1 shows the creature, species, state label and mutant id", () => {
    const { container } = open({ status: "Survived" });
    expect(container.querySelector(".specimen__creature svg")).not.toBeNull();
    expect(container.querySelector(".specimen__species")?.textContent).toBe("Oathbreaker");
    expect(container.querySelector(".specimen__state")?.textContent).toBe("survived");
    expect(screen.getByText("m1")).toBeTruthy();
  });

  it("7.2 shows the original and mutated lines with the file path and 1-based line", () => {
    const { container } = open();
    expect(container.querySelector('pre[data-line="original"]')?.textContent).toBe(
      "const x = a >= b;",
    );
    expect(container.querySelector('pre[data-line="mutated"]')?.textContent).toBe(
      "const x = a > b;",
    );
    const where = container.querySelector(".specimen__where");
    expect(where?.textContent).toBe("src/cmp.ts line 1");
  });

  it("7.3 shows the criterion id and its full text for a Spec_Mutant", () => {
    open({ criterionText: "WHEN the amount is exactly 10, THE cart SHALL accept it." });
    const criterion = within(section("Criterion"));
    expect(criterion.getByText("2.1")).toBeTruthy();
    expect(
      criterion.getByText("WHEN the amount is exactly 10, THE cart SHALL accept it."),
    ).toBeTruthy();
  });

  it("7.4 shows the witness input, the expected value and the value of the mutant", () => {
    open({
      withWitness: true,
      mutatedOutcome: { kind: "value", value: false },
    });
    const witness = within(section("Witness"));
    expect(witness.getByText("atLeast(10, 10)")).toBeTruthy();
    expect(witness.getByText("expected value").nextElementSibling?.textContent).toBe("true");
    expect(witness.getByText("mutant gives").nextElementSibling?.textContent).toBe("value: false");
  });

  it("7.4 renders an error class, a timeout and a missing outcome distinctly", () => {
    const kinds: [Outcome, string, string][] = [
      [{ kind: "error", className: "RangeError" }, "error", "throws: RangeError"],
      [{ kind: "timeout", message: "after 5000 ms" }, "timeout", "timed out: after 5000 ms"],
      [
        { kind: "no-outcome", message: "runner crashed" },
        "no-outcome",
        "no outcome: runner crashed",
      ],
    ];
    for (const [outcome, kind, text] of kinds) {
      const { container, unmount } = open({ withWitness: true, mutatedOutcome: outcome });
      const el = container.querySelector(".specimen__outcome");
      expect(el?.getAttribute("data-outcome-kind")).toBe(kind);
      expect(el?.textContent).toBe(text);
      unmount();
    }
  });

  it("7.5 lists the killing tests and the kill class of a killed mutant", () => {
    const { container } = open({
      status: "Killed",
      killingTests: ["cart > a", "cart > b"],
      killClass: "both",
    });
    const killers = within(section("Killed by"));
    expect(killers.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "cart > a",
      "cart > b",
    ]);
    expect(container.querySelector(".specimen__kill-class")?.textContent).toBe("both");
  });

  it("7.5 lists at most 50 of 51 killing tests", () => {
    const tests = Array.from({ length: 51 }, (_, i) => `test ${i + 1}`);
    open({ status: "Killed", killingTests: tests, killClass: "examples-only" });
    const killers = within(section("Killed by"));
    expect(killers.getAllByRole("listitem")).toHaveLength(50);
    expect(killers.queryByText("test 51")).toBeNull();
    expect(killers.getByText("test 50")).toBeTruthy();
    expect(killers.getByText("1 more not shown.")).toBeTruthy();
  });

  it("7.6 lists the tests that ran the code without failing for a survivor", () => {
    open({ status: "Survived", coveredBy: ["t-ran-1", "t-ran-2"] });
    const covered = within(section("Ran this code without failing"));
    expect(covered.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "t-ran-1",
      "t-ran-2",
    ]);
  });

  it("7.6 lists at most 50 covering tests", () => {
    open({
      status: "Survived",
      coveredBy: Array.from({ length: 51 }, (_, i) => `ran ${i + 1}`),
    });
    expect(within(section("Ran this code without failing")).getAllByRole("listitem")).toHaveLength(
      50,
    );
  });

  it("7.7 says that no test runs the code of an in-the-dark mutant", () => {
    open({ status: "NoCoverage" });
    expect(screen.getByText("no test runs this code")).toBeTruthy();
  });

  it("7.10 shows the id and a link to the Verdict screen for an unknown id, with no creature", () => {
    const { container } = open({}, "ghost-id");
    expect(screen.getByText(/ghost-id/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the verdict" }).getAttribute("href")).toBe(
      "#/verdict",
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("pre")).toBeNull();
  });

  it("7.11 shows the replacement, path, line and a notice when the report has no source", () => {
    const { container } = open({ source: "" });
    expect(screen.getByText("original line unavailable")).toBeTruthy();
    expect(screen.getByText("a > b")).toBeTruthy();
    expect(container.querySelector(".specimen__where")?.textContent).toBe("src/cmp.ts line 1");
    expect(container.querySelector("pre")).toBeNull();
  });

  it("7.12 omits the criterion section when the verdict lacks the criterion", () => {
    open({ listCriterion: false, withWitness: true });
    expect(screen.queryByRole("heading", { name: "Criterion" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Code change" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Witness" })).toBeTruthy();
  });

  it("7.12 omits the criterion section when the criterion has no text", () => {
    open({ criterionText: undefined });
    expect(screen.queryByRole("heading", { name: "Criterion" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Code change" })).toBeTruthy();
  });

  it("7.12 shows the witness without the mutant's value when mutatedOutcome is absent", () => {
    open({ withWitness: true, mutatedOutcome: undefined });
    const witness = within(section("Witness"));
    expect(witness.getByText("atLeast(10, 10)")).toBeTruthy();
    expect(witness.getByText("expected value")).toBeTruthy();
    expect(witness.queryByText("mutant gives")).toBeNull();
  });
});
