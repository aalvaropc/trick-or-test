import type { ReactNode } from "react";
import { CreatureLink } from "../../bestiary/CreatureLink.js";
import { computeCoverageView, type SealEntry } from "../../bestiary/coverage.js";
import { CREATURE_SIZES } from "../../bestiary/creature-sizes.js";
import type { RunModel } from "../../loader/run-model.js";

const COLOUR = {
  closed: "var(--verdigris)",
  cracked: "var(--ember)",
  empty: "var(--mist)",
  skipped: "var(--mist)",
  unrecognised: "var(--amber)",
} as const;

type Kind = keyof typeof COLOUR;

/** Each seal has its own shape, so status never rests on colour alone. */
function SealDrawing({ kind }: { kind: Kind }) {
  const common = { stroke: COLOUR[kind], strokeWidth: 3, fill: "none" };
  let shape: ReactNode;
  switch (kind) {
    case "closed":
      shape = (
        <>
          <circle cx="32" cy="32" r="24" {...common} fill={COLOUR.closed} fillOpacity="0.25" />
          <circle cx="32" cy="32" r="14" {...common} />
        </>
      );
      break;
    case "cracked":
      shape = (
        <>
          <path d="M32 8 A24 24 0 0 0 8 32 A24 24 0 0 0 32 56 L28 40 L36 30 L30 20 Z" {...common} />
          <path
            d="M36 8 A24 24 0 0 1 56 32 A24 24 0 0 1 36 56 L34 40 L42 30 L36 20 Z"
            {...common}
          />
        </>
      );
      break;
    case "empty":
      shape = <circle cx="32" cy="32" r="24" {...common} strokeDasharray="5 4" />;
      break;
    case "skipped":
      shape = <path d="M10 32 H54" {...common} />;
      break;
    case "unrecognised":
      shape = (
        <path d="M32 6 L58 32 L32 58 L6 32 Z M32 22 V36 M32 42 V46" {...common} strokeWidth={3} />
      );
      break;
  }
  return (
    <svg
      className="seal__drawing"
      viewBox="0 0 64 64"
      width={CREATURE_SIZES.sealDrawing}
      height={CREATURE_SIZES.sealDrawing}
      aria-hidden="true"
      focusable="false"
    >
      {shape}
    </svg>
  );
}

function SealBody({ entry }: { entry: SealEntry }) {
  switch (entry.status) {
    case "guarded":
      return <p className="seal__label">guarded</p>;
    case "unguarded":
      return (
        <>
          <p className="seal__label">unguarded</p>
          <ul className="seal__survivors">
            {entry.survivors.map((m) => (
              <li key={m.id}>
                <CreatureLink
                  mutantId={m.id}
                  species={m.species}
                  state="survivor"
                  mutant={m}
                  place="sealCreature"
                />
              </li>
            ))}
          </ul>
        </>
      );
    case "unattacked":
      return <p className="seal__label">no mutant bred</p>;
    case "skipped":
      return (
        <>
          <p className="seal__label">skipped</p>
          <p className="seal__reason">{entry.reason}</p>
        </>
      );
    case "unrecognised":
      return (
        <>
          <p className="seal__label">unrecognised status</p>
          <p className="seal__reason">{entry.rawStatus}</p>
        </>
      );
  }
}

const KIND: Record<SealEntry["status"], { data: string; kind: Kind }> = {
  guarded: { data: "closed", kind: "closed" },
  unguarded: { data: "cracked", kind: "cracked" },
  unattacked: { data: "empty", kind: "empty" },
  skipped: { data: "skipped", kind: "skipped" },
  unrecognised: { data: "unrecognised", kind: "unrecognised" },
};

/** One seal per coverage list entry (6.2 to 6.7, 6.16). */
export function SealGrid({ model }: { model: RunModel }) {
  const entries = computeCoverageView(model);
  return (
    <ul className="seal-grid grid">
      {entries.map((entry, index) => {
        const { data, kind } = KIND[entry.status];
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: coverage ids may repeat; position is stable
            key={`${entry.criterion}-${index}`}
            className="seal"
            data-testid={`seal-${entry.criterion}`}
            data-seal={data}
          >
            <SealDrawing kind={kind} />
            <div className="seal__body">
              <h3 className="seal__criterion">{entry.criterion}</h3>
              {entry.text === undefined ? null : <p className="seal__text">{entry.text}</p>}
              <SealBody entry={entry} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
