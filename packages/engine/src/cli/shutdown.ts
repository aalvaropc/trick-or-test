/** The parts of `process` the coordinator uses, so tests can inject a fake. */
export interface ShutdownProcess {
  on(signal: "SIGINT" | "SIGTERM", handler: () => void): unknown;
  exit(code: number): unknown;
}

export interface ShutdownOptions {
  readonly process: ShutdownProcess;
  readonly runner: { killAll(signal: NodeJS.Signals): Promise<void> };
  readonly removeLeftoverSandboxes: (projectRoot: string) => Promise<unknown>;
  readonly projectRoot: string;
}

const EXIT_CODES = { SIGINT: 130, SIGTERM: 143 } as const;

/**
 * Installs one handler for SIGINT and SIGTERM (Requirement 9.15): stop every child process group,
 * remove the Sandboxes, then exit with 130 or 143. A cleanup error never changes the exit code,
 * and a second signal during cleanup is ignored.
 */
export const installShutdown = (options: ShutdownOptions): void => {
  let started = false;
  const handle = (signal: "SIGINT" | "SIGTERM"): void => {
    if (started) return;
    started = true;
    void (async () => {
      try {
        await options.runner.killAll(signal);
      } catch {
        // Cleanup is best effort; the exit code is decided by the signal.
      }
      try {
        await options.removeLeftoverSandboxes(options.projectRoot);
      } catch {
        // Same as above.
      }
      options.process.exit(EXIT_CODES[signal]);
    })();
  };
  options.process.on("SIGINT", () => handle("SIGINT"));
  options.process.on("SIGTERM", () => handle("SIGTERM"));
};
