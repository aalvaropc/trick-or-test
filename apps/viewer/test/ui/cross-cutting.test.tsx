import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App.js";
import { CreatureLink } from "../../src/bestiary/CreatureLink.js";
import type { CreatureState } from "../../src/bestiary/state.js";
import { readFixture } from "../fixtures/load.js";

const here = dirname(fileURLToPath(import.meta.url));
const viewerRoot = resolve(here, "../..");

const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "node_modules") out.push(...walk(full));
    } else out.push(full);
  }
  return out.sort();
};

const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".html", ".json", ".jsonl", ".txt"]);
const textFilesUnder = (dir: string): { rel: string; text: string }[] =>
  walk(join(viewerRoot, dir))
    .filter((file) => TEXT_EXTENSIONS.has(extname(file)))
    .map((file) => ({
      rel: relative(viewerRoot, file).split("\\").join("/"),
      text: readFileSync(file, "utf8"),
    }));

const sourceFiles = textFilesUnder("src");
const testFiles = textFilesUnder("test");
const indexHtml = { rel: "index.html", text: readFileSync(join(viewerRoot, "index.html"), "utf8") };

/** The screens, as hash routes, with the title word each one must carry. */
const SCREENS: { id: string; name: string; hash: string }[] = [
  { id: "landing", name: "Landing", hash: "#/" },
  { id: "verdict", name: "Verdict", hash: "#/verdict" },
  { id: "specimen", name: "Specimen", hash: "#/mutant/m1" },
  { id: "hunt", name: "Hunt", hash: "#/hunt" },
  { id: "plain", name: "Plain view", hash: "#/plain" },
];

const fileOf = (url: string): string => url.slice(url.lastIndexOf("/") + 1);

const fetchCalls: string[] = [];

const stubFetch = () => {
  const bodies: Record<string, string> = {
    "report.json": readFixture("report.json"),
    "verdict.json": readFixture("verdict.json"),
    "history.jsonl": readFixture("history.jsonl"),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      fetchCalls.push(String(input));
      return new Response(bodies[fileOf(String(input))] ?? "", { status: 200 });
    }),
  );
};

const goto = async (hash: string) => {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
};

/** Opens the demo run, then returns once the Verdict screen has the Run loaded. */
const openRun = async () => {
  window.location.hash = "#/demo/before";
  const view = render(<App />);
  await waitFor(() => expect(window.location.hash).toBe("#/verdict"));
  await waitFor(() =>
    expect(view.container.querySelector("[data-screen]")?.getAttribute("data-screen")).toBe(
      "verdict",
    ),
  );
  return view;
};

/** Visits every screen with the fixtures loaded and hands each rendered container to `check`. */
const eachScreen = async (check: (name: string, root: HTMLElement) => void) => {
  const view = await openRun();
  for (const { id, name, hash } of SCREENS) {
    await goto(hash);
    await waitFor(() =>
      expect(view.container.querySelector("[data-screen]")?.getAttribute("data-screen")).toBe(id),
    );
    check(name, view.container);
  }
};

beforeEach(() => {
  window.location.hash = "";
  fetchCalls.length = 0;
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cross-cutting UI checks", () => {
  it("10.6 every interactive element of every screen is reachable by Tab", async () => {
    await eachScreen((name, root) => {
      const interactive = root.querySelectorAll<HTMLElement>(
        "a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]",
      );
      const unreachable = [...interactive]
        .filter((element) => !element.hasAttribute("hidden") && !element.closest("[hidden]"))
        .filter((element) => element.tabIndex < 0 || element.hasAttribute("disabled"))
        .map((element) => `${name}: ${element.outerHTML.slice(0, 80)}`);
      expect(unreachable).toEqual([]);
    });
  });

  it("10.6 the Landing screen has a Tab-reachable control that stands in for the hidden file input", async () => {
    await eachScreen((name, root) => {
      if (name !== "Landing") return;
      const button = [...root.querySelectorAll<HTMLElement>("button")].find(
        (element) => element.textContent === "Choose files",
      );
      expect(button?.tabIndex).toBe(0);
    });
  });

  it("10.11 every screen has exactly one h1 and a title that contains the screen name", async () => {
    await eachScreen((name, root) => {
      expect(root.querySelectorAll("h1")).toHaveLength(1);
      expect(root.querySelector("[data-screen]")?.getAttribute("data-screen")).toBe(
        SCREENS.find((screen) => screen.name === name)?.id,
      );
      expect(document.title).toContain(name);
    });
  });

  it("10.5 each state has its own text label and its own shape", () => {
    const expected: Record<CreatureState, string> = {
      survivor: "survived",
      killed: "killed",
      "in-the-dark": "no test runs this code",
      ghost: "ghost, not counted",
    };
    const shapes = new Set<string>();
    const labels = new Set<string>();
    for (const state of Object.keys(expected) as CreatureState[]) {
      const { container, unmount } = render(
        <CreatureLink
          mutantId={`id-${state}`}
          species="Borderling"
          state={state}
          mutant={{
            file: "src/a.ts",
            location: { start: { line: 3 } },
            original: ">=",
            replacement: ">",
          }}
        />,
      );
      const shape = container.querySelector("[data-state-shape]");
      expect(shape?.getAttribute("data-state-shape")).toBe(state);
      expect(shape?.innerHTML.length ?? 0).toBeGreaterThan(0);
      shapes.add(shape?.innerHTML ?? "");
      const label = container.querySelector(".creature-link__label")?.textContent ?? "";
      expect(label).toBe(expected[state]);
      labels.add(label);
      unmount();
    }
    expect(shapes.size).toBe(4);
    expect(labels.size).toBe(4);
  });

  it("10.5 every creature link on every screen carries a shape and a text label", async () => {
    let links = 0;
    await eachScreen((_name, root) => {
      for (const link of root.querySelectorAll(".creature-link")) {
        links += 1;
        expect(link.querySelector("[data-state-shape]")).not.toBeNull();
        expect((link.querySelector(".creature-link__label")?.textContent ?? "").trim()).not.toBe(
          "",
        );
      }
    });
    expect(links).toBeGreaterThan(0);
  });

  it("10.10 no user-facing sentence has more than 20 words and no exclamation mark appears", async () => {
    await eachScreen((name, root) => {
      const copy = root.cloneNode(true) as HTMLElement;
      // Licence texts, code and creature drawings are data, not field-notes voice.
      for (const node of copy.querySelectorAll("pre, code, svg, script, style")) node.remove();
      // Group text nodes by their nearest text block, so separate blocks never run together.
      const blocks = new Map<Element, string[]>();
      const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (parent === null) continue;
        const block =
          parent.closest(
            "p, li, dd, dt, td, th, h1, h2, h3, h4, h5, h6, summary, button, a, label",
          ) ?? parent;
        blocks.set(block, [...(blocks.get(block) ?? []), node.textContent ?? ""]);
      }
      const texts = [...blocks.values()].map((parts) =>
        parts.join(" ").replace(/\s+/g, " ").trim(),
      );
      expect(texts.join(" "), `${name} text`).not.toContain("!");
      const long = texts
        .flatMap((text) => text.split(/(?<=[.?])\s+/))
        .filter((sentence) => sentence.trim().split(" ").length > 20);
      expect(long, `${name} long sentences`).toEqual([]);
    });
  });

  it("10.4 no font-size under 14px in the styles, the markup or the drawn creatures", async () => {
    const toPx = (value: string): number | undefined => {
      const match = /^(\d*\.?\d+)(px|rem|em)$/.exec(value.trim());
      if (match === null) return undefined;
      const amount = Number(match[1]);
      return match[2] === "px" ? amount : amount * 16;
    };
    const small: string[] = [];
    const scan = (where: string, text: string) => {
      for (const match of text.matchAll(/font-size\s*[:=]\s*["']?([^;"'}\s]+)/gi)) {
        const px = toPx(match[1] ?? "");
        if (px !== undefined && px < 14) small.push(`${where}: ${match[0]}`);
      }
      for (const match of text.matchAll(/\bfont\s*:\s*[^;}]*?(\d*\.?\d+(?:px|rem|em))/gi)) {
        const px = toPx(match[1] ?? "");
        if (px !== undefined && px < 14) small.push(`${where}: ${match[0]}`);
      }
    };
    for (const { rel, text } of sourceFiles) scan(rel, text);
    await eachScreen((name, root) => scan(name, root.innerHTML));
    expect(small).toEqual([]);
  });

  it("11.9 opening a run and visiting every screen writes no storage and no cookie", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const cookie = vi.spyOn(document, "cookie", "set");
    await eachScreen(() => {});
    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("11.9 the source never refers to storage, cookies or IndexedDB", () => {
    const offenders = sourceFiles
      .filter(({ rel }) => /\.tsx?$/.test(rel))
      .filter(({ text }) =>
        /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/.test(text),
      )
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  it("12.11 every fetch goes to the page's own origin", async () => {
    await eachScreen(() => {});
    expect(fetchCalls.length).toBeGreaterThan(0);
    const foreign = fetchCalls.filter(
      (url) => new URL(url, window.location.href).origin !== window.location.origin,
    );
    expect(foreign).toEqual([]);
  });

  it("12.11 src and index.html hold no http(s) URL to a third party", () => {
    // The SVG namespace identifier is not a request; every other absolute URL is.
    const NAMESPACE = "http://www.w3.org/2000/svg";
    const offenders: string[] = [];
    for (const { rel, text } of [...sourceFiles, indexHtml]) {
      for (const match of text.replaceAll(NAMESPACE, "").matchAll(/https?:\/\/[^\s"'`)]+/g)) {
        offenders.push(`${rel}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("12.13 neither the source nor the tests refer to the design scratch folder", () => {
    // Built from parts so that this file does not contain the string it forbids.
    const needle = [".trick", "ortest", "/", "des", "ign"].join("");
    const offenders = [...sourceFiles, ...testFiles, indexHtml]
      .filter(({ text }) => text.includes(needle))
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  it("10.9 no screen renders an img element or an emoji", async () => {
    const emoji = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F/u;
    await eachScreen((name, root) => {
      expect(root.querySelectorAll("img"), `${name} img`).toHaveLength(0);
      expect(emoji.test(root.textContent ?? ""), `${name} emoji`).toBe(false);
    });
  });

  it("3.6 the Landing source contains no hard-coded count", () => {
    const source = readFileSync(join(viewerRoot, "src/screens/Landing.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      // The demo wait is a duration in milliseconds, not a count of mutants or criteria.
      .replace(/^export const DEMO_WAIT_MS = [\d_]+;$/m, "");
    const literals = source.match(/(?<![\w.$])\d[\d_]*(?:\.\d+)?(?![\w])/g) ?? [];
    expect(literals).toEqual([]);
  });
});
