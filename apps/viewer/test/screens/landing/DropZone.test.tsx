import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunProvider, useRun } from "../../../src/app/run-context.js";
import { DropZone } from "../../../src/screens/landing/DropZone.js";
import { readFixture } from "../../fixtures/load.js";

const file = (name: string, text: string): File => new File([text], name, { type: "text/plain" });
const fixtureFile = (fixture: string, name = fixture): File => file(name, readFixture(fixture));

const Status = () => {
  const { run } = useRun();
  return (
    <output data-testid="status">
      {run === undefined
        ? "none"
        : `${run.mutants.length}|${run.verdict === undefined ? "noverdict" : "verdict"}|${run.history.length}`}
    </output>
  );
};

const setup = () =>
  render(
    <RunProvider>
      <DropZone />
      <Status />
    </RunProvider>,
  );

const drop = (files: File[]) => {
  fireEvent.drop(screen.getByRole("region", { name: "Load a run" }), {
    dataTransfer: { files },
  });
};

const status = () => screen.getByTestId("status").textContent;

beforeEach(() => {
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DropZone", () => {
  it("1.2 dropping a valid report opens the Verdict route", async () => {
    setup();
    drop([fixtureFile("report.json")]);
    await waitFor(() => expect(window.location.hash).toBe("#/verdict"));
    expect(status()).toMatch(/^\d+\|noverdict\|0$/);
  });

  it("1.3 a report, a verdict and a history file together make one Run", async () => {
    setup();
    drop([fixtureFile("report.json"), fixtureFile("verdict.json"), fixtureFile("history.jsonl")]);
    await waitFor(() => expect(window.location.hash).toBe("#/verdict"));
    expect(status()).toMatch(/^\d+\|verdict\|[1-9]\d*$/);
  });

  it("1.5 a plain Stryker report loads", async () => {
    setup();
    drop([fixtureFile("plain-stryker-report.json")]);
    await waitFor(() => expect(window.location.hash).toBe("#/verdict"));
    expect(status()).toMatch(/^\d+\|noverdict\|0$/);
  });

  it("1.7 an invalid JSON file after a valid one keeps the earlier Run", async () => {
    setup();
    drop([fixtureFile("report.json")]);
    await waitFor(() => expect(window.location.hash).toBe("#/verdict"));
    const before = status();
    window.location.hash = "#/";

    drop([file("broken.json", "{ not json")]);
    expect(await screen.findByText("broken.json")).toBeDefined();
    expect(status()).toBe(before);
    expect(window.location.hash).toBe("#/");
  });

  it("1.8 a schema failure keeps the earlier Run and names the file", async () => {
    setup();
    drop([fixtureFile("report.json")]);
    await waitFor(() => expect(window.location.hash).toBe("#/verdict"));
    const before = status();
    window.location.hash = "#/";

    drop([file("wrong.json", JSON.stringify({ schemaVersion: "2", files: 5, thresholds: {} }))]);
    expect(await screen.findByText("wrong.json")).toBeDefined();
    expect(status()).toBe(before);
    expect(window.location.hash).toBe("#/");
  });

  it("1.9 a verdict without a report shows an error and keeps the earlier Run", async () => {
    setup();
    drop([fixtureFile("report.json")]);
    await waitFor(() => expect(window.location.hash).toBe("#/verdict"));
    const before = status();
    window.location.hash = "#/";

    drop([fixtureFile("verdict.json")]);
    expect(await screen.findByText("A Mutation_Report is required.")).toBeDefined();
    expect(status()).toBe(before);
  });

  it("1.10 a verdict entry with no matching mutant shows the ignored-entry note", async () => {
    setup();
    drop([fixtureFile("report.json"), fixtureFile("verdict.json")]);
    expect(await screen.findByText("1 verdict entry ignored.")).toBeDefined();
  });

  it("12.14 a thrown error shows an error and the app keeps running", async () => {
    vi.spyOn(File.prototype, "text").mockImplementation(() => {
      throw new Error("boom");
    });
    setup();
    drop([fixtureFile("report.json")]);
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(status()).toBe("none");
    expect(window.location.hash).toBe("");
  });

  it("3.5 Tab reaches the picker control and Enter and Space open the picker", async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    setup();
    await user.tab();
    const button = screen.getByRole("button", { name: "Choose files" });
    expect(document.activeElement).toBe(button);
    await user.keyboard("{Enter}");
    expect(click).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("3.4 files chosen with the picker load like dropped files", async () => {
    setup();
    fireEvent.change(screen.getByTestId("file-input"), {
      target: { files: [fixtureFile("report.json")] },
    });
    await waitFor(() => expect(window.location.hash).toBe("#/verdict"));
  });

  it("1.1 loading files makes no network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      setup();
      drop([fixtureFile("report.json")]);
      await waitFor(() => expect(window.location.hash).toBe("#/verdict"));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
