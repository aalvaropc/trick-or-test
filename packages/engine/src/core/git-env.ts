/**
 * Variables that tell git where a repository is. A git hook exports them, and a git child
 * that inherits them reads that repository instead of the one in its working directory
 * (Requirement 3.21). Names are matched exactly, so case matters.
 */
const GIT_LOCATION_VARIABLES: ReadonlySet<string> = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
  "GIT_CEILING_DIRECTORIES",
  "GIT_DISCOVERY_ACROSS_FILESYSTEM",
]);

/** A copy of `env` without the repository-location variables. `env` is not modified. */
export const withoutGitLocation = (
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !GIT_LOCATION_VARIABLES.has(name)));
