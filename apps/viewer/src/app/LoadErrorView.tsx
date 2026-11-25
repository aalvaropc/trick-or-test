import type { LoadError } from "../loader/types.js";

const MAX_PATHS = 10;

/**
 * Shows why a file did not load (1.7, 1.8, 1.13, 1.14, 2.3, 2.4): the file name, the message,
 * the line of a History_File error, up to 10 failing field paths and the count of further ones.
 * The optional note counts Verdict_File entries that matched no mutant (1.10).
 */
export function LoadErrorView({
  error,
  ignoredVerdictEntryCount = 0,
}: {
  error: LoadError;
  ignoredVerdictEntryCount?: number;
}) {
  const paths = (error.fieldPaths ?? []).slice(0, MAX_PATHS);
  const more = error.truncatedCount ?? 0;
  return (
    <section className="load-error" role="alert">
      {error.fileName === "" ? null : (
        <p>
          <code>{error.fileName}</code>
        </p>
      )}
      <p>{error.message}</p>
      {error.line === undefined ? null : <p>{`Line ${error.line}`}</p>}
      {paths.length === 0 ? null : (
        <ul aria-label="Failing fields">
          {paths.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
      )}
      {more > 0 ? <p>{`${more} more`}</p> : null}
      {ignoredVerdictEntryCount > 0 ? (
        <p>
          {ignoredVerdictEntryCount === 1
            ? "1 verdict entry ignored."
            : `${ignoredVerdictEntryCount} verdict entries ignored.`}
        </p>
      ) : null}
    </section>
  );
}
