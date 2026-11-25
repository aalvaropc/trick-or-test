import { describe, expect, it } from "vitest";
import { type CliDeps, runCli } from "../../src/cli/main.js";
import { err } from "../../src/core/result.js";

type Handler = () => void;

const setup = (options: { hangOnRead?: boolean } = {}) => {
  const events: string[] = [];
  const handlers = new Map<string, Handler>();
  const exits: number[] = [];
  const shutdownProcess = {
    on(signal: "SIGINT" | "SIGTERM", handler: Handler) {
      events.push(`on:${signal}`);
      handlers.set(signal, handler);
    },
    exit(code: number) {
      events.push(`exit:${code}`);
      exits.push(code);
    },
  };
  const never = new Promise<never>(() => {});
  const deps = {
    cwd: "/work",
    stdout: () => {},
    stderr: () => {},
    fs: {
      async readFile(path: string) {
        events.push("adapter:readFile");
        if (options.hangOnRead) return never;
        return err(`ENOENT ${path}`);
      },
      async exists() {
        events.push("adapter:exists");
        return false;
      },
      async listDir() {
        events.push("adapter:listDir");
        return err("ENOENT");
      },
      async writeFile() {
        events.push("adapter:writeFile");
        return err("nope");
      },
    },
    shutdown: {
      process: shutdownProcess,
      runner: {
        async killAll(signal: string) {
          events.push(`killAll:${signal}`);
        },
      },
    },
    removeLeftovers: async (root: string) => {
      events.push(`cleanup:${root}`);
      return 0;
    },
  } as unknown as CliDeps;
  return { deps, events, handlers, exits };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("runCli shutdown handlers", () => {
  it("9.15 run installs both handlers before the first adapter call", async () => {
    const h = setup();
    await runCli(["run", "--project", "/work/proj"], h.deps);
    const firstAdapter = h.events.findIndex((e) => e.startsWith("adapter:"));
    expect(h.events.indexOf("on:SIGINT")).toBeGreaterThanOrEqual(0);
    expect(h.events.indexOf("on:SIGTERM")).toBeGreaterThanOrEqual(0);
    expect(firstAdapter).toBeGreaterThan(h.events.indexOf("on:SIGINT"));
    expect(firstAdapter).toBeGreaterThan(h.events.indexOf("on:SIGTERM"));
  });

  it("9.15 measure installs both handlers before the first adapter call", async () => {
    const h = setup();
    await runCli(["measure", "--project", "/work/proj", "--output", "out"], h.deps);
    const firstAdapter = h.events.findIndex((e) => e.startsWith("adapter:"));
    expect(h.events.indexOf("on:SIGINT")).toBeGreaterThanOrEqual(0);
    expect(firstAdapter).toBeGreaterThan(h.events.indexOf("on:SIGTERM"));
  });

  it("9.15 SIGINT during a long run kills children, cleans up and exits 130", async () => {
    const h = setup({ hangOnRead: true });
    void runCli(["run", "--project", "/work/proj"], h.deps);
    await settle();
    h.handlers.get("SIGINT")?.();
    await settle();
    expect(h.exits).toEqual([130]);
    const tail = h.events.slice(h.events.indexOf("killAll:SIGINT"));
    expect(tail).toEqual(["killAll:SIGINT", "cleanup:/work/proj", "exit:130"]);
  });

  it("9.15 SIGTERM during a long run ends with 143", async () => {
    const h = setup({ hangOnRead: true });
    void runCli(["run", "--project", "/work/proj"], h.deps);
    await settle();
    h.handlers.get("SIGTERM")?.();
    await settle();
    expect(h.exits).toEqual([143]);
    expect(h.events).toContain("cleanup:/work/proj");
  });

  it("9.10 an unknown command installs no handlers", async () => {
    const h = setup();
    await runCli(["frobnicate"], h.deps);
    expect(h.events.filter((e) => e.startsWith("on:"))).toEqual([]);
  });
});
