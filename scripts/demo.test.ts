import { describe, expect, it } from "vitest";
import { type Executor, planDemo, runSteps, type Step } from "./demo.ts";

const steps = planDemo(".");

function ofKind<K extends Step["kind"]>(kind: K): Extract<Step, { kind: K }>[] {
  return steps.filter((step): step is Extract<Step, { kind: K }> => step.kind === kind);
}

function measure(run: "before" | "after") {
  const found = ofKind("measure").find((step) => step.run === run);
  if (found === undefined) throw new Error(`no ${run} measure step`);
  return found;
}

function historyCopy() {
  const found = ofKind("copy").find((step) => step.to.endsWith("history.jsonl"));
  if (found === undefined) throw new Error("no history copy step");
  return found;
}

function projectCopy() {
  const found = ofKind("copy").find((step) => !step.to.endsWith("history.jsonl"));
  if (found === undefined) throw new Error("no project copy step");
  return found;
}

/** Every path a step reads or writes, as written in the plan. */
function pathsOf(step: Step): readonly string[] {
  switch (step.kind) {
    case "build":
      return [step.cwd];
    case "clean":
      return step.paths;
    case "measure":
      return [step.cwd, step.project, step.output];
    case "copy":
      return [step.from, step.to, ...step.add.flatMap((file) => [file.from, file.to])];
    case "remove":
      return [step.path];
  }
}

/** Paths a step creates, changes or deletes. */
function writesOf(step: Step): readonly string[] {
  switch (step.kind) {
    case "build":
      return [];
    case "clean":
      return step.paths;
    case "measure":
      return [step.output];
    case "copy":
      return [step.to, ...step.add.map((file) => file.to)];
    case "remove":
      return [step.path];
  }
}

describe("planDemo", () => {
  it("14.3 14.4 the plan order is build, clean, measure before, copy, copy history, measure after, remove", () => {
    expect(
      steps.map((step) => (step.kind === "measure" ? `measure ${step.run}` : step.kind)),
    ).toEqual(["build", "clean", "measure before", "copy", "copy", "measure after", "remove"]);
    expect(steps[3]).toBe(projectCopy());
    expect(steps[4]).toBe(historyCopy());
  });

  it("14.4 the build step builds the engine workspace", () => {
    expect(ofKind("build")[0]?.args).toEqual(["run", "build", "-w", "trick-or-test"]);
  });

  it("14.4 the clean step removes the three files of both runs and nothing else", () => {
    expect(ofKind("clean")[0]?.paths).toEqual([
      "apps/viewer/public/demo/before/mutation-report.json",
      "apps/viewer/public/demo/before/verdict.json",
      "apps/viewer/public/demo/before/history.jsonl",
      "apps/viewer/public/demo/after/mutation-report.json",
      "apps/viewer/public/demo/after/verdict.json",
      "apps/viewer/public/demo/after/history.jsonl",
    ]);
  });

  it("14.5 the before measure targets examples/pricing and the before output directory", () => {
    const before = measure("before");
    expect(before.project).toBe("examples/pricing");
    expect(before.spec).toBe("cart-pricing");
    expect(before.output).toBe("apps/viewer/public/demo/before");
    expect(before.command).toBe(process.execPath);
    expect(before.args).toEqual([
      "packages/engine/dist/cli/main.js",
      "measure",
      "--project",
      "examples/pricing",
      "--spec",
      "cart-pricing",
      "--output",
      "apps/viewer/public/demo/before",
    ]);
  });

  it("14.6 the after measure targets the copy under .trickortest and the after output directory", () => {
    const after = measure("after");
    expect(after.project).toBe(".trickortest/demo-after");
    expect(after.spec).toBe("cart-pricing");
    expect(after.output).toBe("apps/viewer/public/demo/after");
    expect(after.command).toBe(process.execPath);
    expect(after.args).toEqual([
      "packages/engine/dist/cli/main.js",
      "measure",
      "--project",
      ".trickortest/demo-after",
      "--spec",
      "cart-pricing",
      "--output",
      "apps/viewer/public/demo/after",
    ]);
  });

  it("14.5 no step runs npx", () => {
    for (const step of steps) {
      if (step.kind !== "build" && step.kind !== "measure") continue;
      expect(step.command).not.toBe("npx");
      expect(step.args).not.toContain("npx");
    }
  });

  it("14.6 the copy is made from examples/pricing into .trickortest/demo-after", () => {
    const copy = projectCopy();
    expect(copy.from).toBe("examples/pricing");
    expect(copy.to).toBe(".trickortest/demo-after");
  });

  it("14.6 the copy leaves out node_modules, reports, .stryker-tmp and .trickortest", () => {
    expect([...projectCopy().exclude].sort()).toEqual(
      [".stryker-tmp", ".trickortest", "node_modules", "reports"].sort(),
    );
  });

  it("14.8 the copy receives the Guard_Test outside its test folder and the widened vitest config", () => {
    expect(projectCopy().add).toEqual([
      {
        from: "scripts/demo/after/guard-7.4.test.ts",
        to: ".trickortest/demo-after/extra/guard-7.4.test.ts",
      },
      {
        from: "scripts/demo/after/vitest.config.ts",
        to: ".trickortest/demo-after/vitest.config.ts",
      },
    ]);
  });

  it("14.7 the history copy goes from the before directory to the after directory, before the after measure", () => {
    const copy = historyCopy();
    expect(copy.from).toBe("apps/viewer/public/demo/before/history.jsonl");
    expect(copy.to).toBe("apps/viewer/public/demo/after/history.jsonl");
    expect(steps.indexOf(copy)).toBeLessThan(steps.indexOf(measure("after")));
    expect(steps.indexOf(copy)).toBeGreaterThan(steps.indexOf(measure("before")));
  });

  it("14.3 the history copy is the only step that writes a report, verdict or history file", () => {
    const reportFile = /(mutation-report\.json|verdict\.json|history\.jsonl)$/;
    const writers = steps.flatMap((step) =>
      step.kind === "clean" ? [] : writesOf(step).filter((path) => reportFile.test(path)),
    );
    expect(writers).toEqual(["apps/viewer/public/demo/after/history.jsonl"]);
  });

  it("14.10 every path in the plan is relative", () => {
    const all = steps.flatMap(pathsOf);
    expect(all.length).toBeGreaterThan(10);
    for (const path of all) {
      expect(path.startsWith("/")).toBe(false);
      expect(/^[A-Za-z]:/.test(path)).toBe(false);
      expect(path.split("/")).not.toContain("..");
    }
  });

  it("14.4 no step writes inside reports/ or examples/pricing/", () => {
    for (const path of steps.flatMap(writesOf)) {
      expect(path === "reports" || path.startsWith("reports/")).toBe(false);
      expect(path === "examples/pricing" || path.startsWith("examples/pricing/")).toBe(false);
    }
  });

  it("14.4 planning twice gives the same steps", () => {
    expect(planDemo(".")).toEqual(steps);
  });
});

describe("runSteps", () => {
  function recorder(failOn?: (step: Step) => boolean): { executor: Executor; ran: Step[] } {
    const ran: Step[] = [];
    return {
      ran,
      executor: {
        run(step) {
          ran.push(step);
          if (failOn?.(step)) throw new Error("boom");
        },
      },
    };
  }

  it("14.3 runs every step once, in plan order", () => {
    const { executor, ran } = recorder();
    runSteps(steps, executor);
    expect(ran).toEqual(steps);
  });

  it("14.6 removes the copy when the after measure fails", () => {
    const { executor, ran } = recorder((step) => step.kind === "measure" && step.run === "after");
    expect(() => runSteps(steps, executor)).toThrow("boom");
    expect(ran.at(-1)?.kind).toBe("remove");
  });

  it("14.6 removes the copy when the build fails and stops the other steps", () => {
    const { executor, ran } = recorder((step) => step.kind === "build");
    expect(() => runSteps(steps, executor)).toThrow("boom");
    expect(ran.map((step) => step.kind)).toEqual(["build", "remove"]);
  });
});
