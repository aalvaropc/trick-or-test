import { useMemo, useState } from "react";
import { useRun } from "../app/run-context.js";
import { ScreenFrame } from "../app/ScreenFrame.js";
import { screenTitle } from "../app/screen-title.js";
import { computeStateCounts } from "../bestiary/counts.js";
import { buildRows, type ColumnId } from "../plain-view/columns.js";
import { type SortDirection, sortRows } from "../plain-view/sort.js";

type View = { id: ColumnId; label: string };

/** Seven columns (9.2): file and line share one column, sorted by file. */
const VIEW_COLUMNS: readonly View[] = [
  { id: "id", label: "Mutant" },
  { id: "species", label: "Species" },
  { id: "state", label: "State" },
  { id: "status", label: "Status" },
  { id: "requirement", label: "Criterion" },
  { id: "file", label: "File and line" },
  { id: "killClass", label: "Kill class" },
];

const COUNT_LABELS = [
  ["survivor", "survived"],
  ["killed", "killed"],
  ["in-the-dark", "no test runs this code"],
  ["ghost", "ghost, not counted"],
  ["not-counted", "not counted"],
] as const;

/** Plain view (9): the same data as one sortable table, with no creature and no motion. */
export function PlainView() {
  const { run } = useRun();
  const [sort, setSort] = useState<{ column: ColumnId; direction: SortDirection } | undefined>();

  const rows = useMemo(() => {
    if (run === undefined) return [];
    const built = buildRows(run);
    return sort === undefined ? built : sortRows(built, sort.column, sort.direction);
  }, [run, sort]);

  const activate = (column: ColumnId) =>
    setSort((current) =>
      current?.column === column
        ? { column, direction: current.direction === "ascending" ? "descending" : "ascending" }
        : { column, direction: "ascending" },
    );

  if (run === undefined) {
    return (
      <ScreenFrame screen="plain" title={screenTitle("plain", {})}>
        <p>no run is loaded</p>
      </ScreenFrame>
    );
  }

  const counts = computeStateCounts(run);

  return (
    <ScreenFrame screen="plain" title={screenTitle("plain", { run })}>
      <dl className="state-counts">
        {COUNT_LABELS.map(([state, label]) => (
          <div key={state}>
            <dt>{label}</dt>
            <dd data-testid={`count-${state}`}>{counts[state]}</dd>
          </div>
        ))}
      </dl>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {VIEW_COLUMNS.map((c) => {
                const direction = sort?.column === c.id ? sort.direction : undefined;
                return (
                  <th key={c.id} scope="col" aria-sort={direction}>
                    <button type="button" onClick={() => activate(c.id)}>
                      {c.label}
                      {direction === undefined ? null : <span> {direction}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={VIEW_COLUMNS.length}>this run has no mutants</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.mutantId}>
                  <td>{r.mutantId}</td>
                  <td>{r.species}</td>
                  <td>{r.stateLabel}</td>
                  <td>{r.status}</td>
                  <td>{r.requirement ?? ""}</td>
                  <td>{`${r.file}:${r.line}`}</td>
                  <td>{r.killClass ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ScreenFrame>
  );
}
