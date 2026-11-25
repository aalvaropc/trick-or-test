import { type ChildProcess, spawn } from "node:child_process";

export type ProcessResult = {
  /** Exit code, or null when the child ended through a signal or never started. */
  readonly exitCode: number | null;
  /** Signal that ended the child, if any. */
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  /** stdout and stderr in arrival order, capped at `maxOutputBytes`. */
  readonly output: string;
  /** True when the per-run `timeoutMs` fired and the group was killed. */
  readonly timedOut: boolean;
  /** Set when the child could not be started. */
  readonly spawnError?: string;
};

export type RunOptions = {
  readonly cwd: string;
  /** Kills the child's process group when exceeded. */
  readonly timeoutMs?: number;
  /** Cap per captured stream and for the combined output. Defaults to 256 KiB. */
  readonly maxOutputBytes?: number;
};

export type ProcessRunnerOptions = {
  /** Time between the first signal and SIGKILL. Defaults to 2000 ms. */
  readonly graceMs?: number;
};

export type ProcessRunner = {
  run(command: string, args: readonly string[], options: RunOptions): Promise<ProcessResult>;
  /** Sends `signal` to every live process group, then SIGKILL after the grace period. */
  killAll(signal: NodeJS.Signals): Promise<void>;
  /** Number of children currently registered. */
  liveCount(): number;
};

const DEFAULT_MAX_OUTPUT = 256 * 1024;
const DEFAULT_GRACE_MS = 2000;

type Live = { readonly child: ChildProcess; readonly exited: Promise<void> };

const signalGroup = (child: ChildProcess, signal: NodeJS.Signals): void => {
  try {
    if (child.pid !== undefined) process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The child is already gone.
    }
  }
};

export const createProcessRunner = (config: ProcessRunnerOptions = {}): ProcessRunner => {
  const graceMs = config.graceMs ?? DEFAULT_GRACE_MS;
  const live = new Set<Live>();

  /** Signals one group and escalates to SIGKILL when it has not ended after the grace. */
  const stopGroup = async (entry: Live, signal: NodeJS.Signals): Promise<void> => {
    signalGroup(entry.child, signal);
    if (signal === "SIGKILL") {
      await entry.exited;
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), graceMs);
    });
    const finished = entry.exited.then(() => false);
    const needsKill = await Promise.race([expired, finished]);
    clearTimeout(timer);
    if (needsKill) {
      signalGroup(entry.child, "SIGKILL");
      await entry.exited;
    }
  };

  return {
    run(command, args, options) {
      const cap = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
      return new Promise<ProcessResult>((done) => {
        let stdout = "";
        let stderr = "";
        let output = "";
        let timedOut = false;
        let settled = false;
        let entry: Live | undefined;
        let timer: NodeJS.Timeout | undefined;
        let markExited: () => void = () => {};
        const exited = new Promise<void>((resolve) => {
          markExited = resolve;
        });

        const finish = (
          result: Omit<ProcessResult, "stdout" | "stderr" | "output" | "timedOut">,
        ) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (entry !== undefined) live.delete(entry);
          markExited();
          done({ ...result, stdout, stderr, output, timedOut });
        };

        const child = spawn(command, [...args], {
          cwd: options.cwd,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        entry = { child, exited };
        live.add(entry);

        child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
          if (stdout.length < cap) stdout += chunk;
          if (output.length < cap) output += chunk;
        });
        child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
          if (stderr.length < cap) stderr += chunk;
          if (output.length < cap) output += chunk;
        });
        if (options.timeoutMs !== undefined) {
          timer = setTimeout(() => {
            timedOut = true;
            signalGroup(child, "SIGKILL");
          }, options.timeoutMs);
        }
        child.on("error", (error) => {
          finish({ exitCode: null, signal: null, spawnError: error.message });
        });
        child.on("close", (code, signal) => {
          finish({ exitCode: code, signal });
        });
      });
    },

    async killAll(signal) {
      await Promise.all([...live].map((entry) => stopGroup(entry, signal)));
    },

    liveCount: () => live.size,
  };
};

/** The runner shared by every adapter, so one `killAll` reaches every child. */
export const ProcessRunner: ProcessRunner = createProcessRunner();
