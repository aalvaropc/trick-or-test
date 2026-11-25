import { computeHeadlineCounts } from "../../bestiary/counts.js";
import type { RunModel } from "../../loader/run-model.js";

type Item = { id: string; label: string; value: number };

/**
 * Verdict headline (6.1, 6.14): surviving and killed Spec_Mutants, guarded and unguarded
 * Criteria. Without a Verdict_File only the counts available from the report are shown.
 */
export function Headline({ model }: { model: RunModel }) {
  const counts = computeHeadlineCounts(model);
  const items: Item[] = [
    {
      id: "headline-surviving",
      label: "surviving spec mutants",
      value: counts.survivingSpecMutants,
    },
    { id: "headline-killed", label: "killed spec mutants", value: counts.killedSpecMutants },
  ];
  if (counts.guardedCriteria !== undefined && counts.unguardedCriteria !== undefined) {
    items.push(
      { id: "headline-guarded", label: "guarded criteria", value: counts.guardedCriteria },
      { id: "headline-unguarded", label: "unguarded criteria", value: counts.unguardedCriteria },
    );
  }
  return (
    <dl className="headline">
      {items.map((item) => (
        <div key={item.id}>
          <dt>{item.label}</dt>
          <dd data-testid={item.id}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
