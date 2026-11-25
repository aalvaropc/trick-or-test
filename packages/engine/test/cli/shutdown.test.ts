import { describe, expect, it } from "vitest";
import { installShutdown, type ShutdownProcess } from "../../src/cli/shutdown.js";

type Handler = () => void;

const setup = (options: { killFails?: boolean; removeFails?: boolean } = {}) => {
  const calls: string[] = [];
  const handlers = new Map<string, Handler>();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const proc: ShutdownProcess = {
    on: (signal, handler) => {
      handlers.set(signal, handler);
    },
    exit: (code) => {
      calls.push(`exit:${code}`);
    },
  };
  const runner = {
    killAll: async (signal: NodeJS.Signals) => {
      calls.push(`kill:${signal}`);
      await gate;
      if (options.killFails) throw new Error("kill failed");
    },
  };
  const removeLeftoverSandboxes = async (root: string) => {
    calls.push(`remove:${root}`);
    if (options.removeFails) throw new Error("remove failed");
    return 0;
  };
  installShutdown({ process: proc, runner, removeLeftoverSandboxes, projectRoot: "/tmp/project" });
  const flush = async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { calls, handlers, flush };
};

describe("shutdown coordinator", () => {
  it("9.15 SIGINT exits with 130", async () => {
    const { calls, handlers, flush } = setup();
    handlers.get("SIGINT")?.();
    await flush();
    expect(calls.at(-1)).toBe("exit:130");
  });

  it("9.15 SIGTERM exits with 143", async () => {
    const { calls, handlers, flush } = setup();
    handlers.get("SIGTERM")?.();
    await flush();
    expect(calls.at(-1)).toBe("exit:143");
  });

  it("9.15 kills children, then removes Sandboxes, then exits", async () => {
    const { calls, handlers, flush } = setup();
    handlers.get("SIGTERM")?.();
    await flush();
    expect(calls).toEqual(["kill:SIGTERM", "remove:/tmp/project", "exit:143"]);
  });

  it("9.15 a second signal during cleanup does not start a second cleanup", async () => {
    const { calls, handlers, flush } = setup();
    handlers.get("SIGINT")?.();
    handlers.get("SIGTERM")?.();
    handlers.get("SIGINT")?.();
    await flush();
    expect(calls).toEqual(["kill:SIGINT", "remove:/tmp/project", "exit:130"]);
  });

  it("9.15 a kill error still removes Sandboxes and exits with the signal code", async () => {
    const { calls, handlers, flush } = setup({ killFails: true });
    handlers.get("SIGINT")?.();
    await flush();
    expect(calls).toEqual(["kill:SIGINT", "remove:/tmp/project", "exit:130"]);
  });

  it("9.15 a Sandbox removal error still exits with the signal code", async () => {
    const { calls, handlers, flush } = setup({ removeFails: true });
    handlers.get("SIGTERM")?.();
    await flush();
    expect(calls.at(-1)).toBe("exit:143");
  });
});
