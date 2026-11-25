import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadErrorView } from "../../src/app/LoadErrorView.js";
import type { LoadError } from "../../src/loader/types.js";

afterEach(cleanup);

const paths = (n: number): string[] => Array.from({ length: n }, (_, i) => `files.f${i + 1}`);

const schemaError = (): LoadError => ({
  fileName: "report.json",
  message: `report.json does not match the expected format. Failing fields: ${paths(10).join(", ")} and 2 more.`,
  fieldPaths: paths(10),
  truncatedCount: 2,
});

const sentenceLengths = (container: HTMLElement): number[] =>
  [...container.querySelectorAll("p, li")].flatMap((el) =>
    (el.textContent ?? "")
      .split(/(?<=[.?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => s.split(/\s+/).length),
  );

describe("LoadErrorView", () => {
  it("1.8 schema error with 12 failures shows 10 paths and '2 more'", () => {
    render(<LoadErrorView error={schemaError()} />);
    const list = screen.getByRole("list", { name: "Failing fields" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("2 more")).toBeTruthy();
    expect(within(list).getByText("files.f10")).toBeTruthy();
  });

  it("1.8 schema error with 3 failures shows 3 paths and no 'more'", () => {
    const error: LoadError = {
      fileName: "report.json",
      message: "report.json does not match the expected format.",
      fieldPaths: paths(3),
    };
    render(<LoadErrorView error={error} />);
    const list = screen.getByRole("list", { name: "Failing fields" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it("1.13 history error shows the file name and the line", () => {
    const error: LoadError = {
      fileName: "history.jsonl",
      line: 3,
      message: "history.jsonl, line 3: not valid JSON: Unexpected token",
    };
    render(<LoadErrorView error={error} />);
    expect(screen.getByText("history.jsonl")).toBeTruthy();
    expect(screen.getByText("Line 3")).toBeTruthy();
  });

  it("1.7 an error without a line shows no line note", () => {
    render(
      <LoadErrorView error={{ fileName: "a.json", message: "a.json is not valid JSON: x" }} />,
    );
    expect(screen.queryByText(/^Line /)).toBeNull();
  });

  it("1.14 empty file message is shown", () => {
    render(<LoadErrorView error={{ fileName: "empty.json", message: "The file is empty." }} />);
    expect(screen.getByText("The file is empty.")).toBeTruthy();
    expect(screen.getByText("empty.json")).toBeTruthy();
  });

  it("1.11 50 MB message names the file and the limit", () => {
    const message = "huge.json is larger than the 50 MB limit and was not read.";
    render(<LoadErrorView error={{ fileName: "huge.json", message }} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("huge.json");
    expect(alert.textContent).toContain("50 MB");
  });

  it("1.10 ignored verdict entries note shows the count", () => {
    render(
      <LoadErrorView
        error={{ fileName: "v.json", message: "v.json is not valid JSON: x" }}
        ignoredVerdictEntryCount={4}
      />,
    );
    expect(screen.getByText("4 verdict entries ignored.")).toBeTruthy();
  });

  it("1.10 ignored note is absent when the count is 0 or missing", () => {
    const error = { fileName: "v.json", message: "v.json is not valid JSON: x" };
    const { rerender } = render(<LoadErrorView error={error} ignoredVerdictEntryCount={0} />);
    expect(screen.queryByText(/verdict entr/)).toBeNull();
    rerender(<LoadErrorView error={error} />);
    expect(screen.queryByText(/verdict entr/)).toBeNull();
  });

  it("1.10 one ignored entry uses the singular", () => {
    render(
      <LoadErrorView error={{ fileName: "v.json", message: "x" }} ignoredVerdictEntryCount={1} />,
    );
    expect(screen.getByText("1 verdict entry ignored.")).toBeTruthy();
  });

  it("2.3 demo fetch error names the file", () => {
    const error: LoadError = {
      fileName: "report.json",
      message: "report.json could not be fetched (HTTP 404).",
    };
    render(<LoadErrorView error={error} />);
    expect(screen.getByRole("alert").textContent).toContain("report.json could not be fetched");
  });

  it("2.4 invalid demo content names the file", () => {
    const error: LoadError = {
      fileName: "verdict.json",
      message: "verdict.json has invalid content.",
    };
    render(<LoadErrorView error={error} />);
    expect(screen.getByRole("alert").textContent).toContain("verdict.json has invalid content.");
  });

  it("12.14 no exclamation mark and no sentence over 20 words", () => {
    const { container } = render(
      <LoadErrorView error={{ ...schemaError(), line: 7 }} ignoredVerdictEntryCount={5} />,
    );
    expect(container.textContent).not.toContain("!");
    const lengths = sentenceLengths(container);
    expect(lengths.length).toBeGreaterThan(0);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(20);
  });
});
