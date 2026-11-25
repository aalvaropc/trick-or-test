import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_DIR = join(ENGINE_DIR, "src");
const PACKAGE_JSON = join(ENGINE_DIR, "package.json");

const HTTP_CLIENTS = [
  "axios",
  "node-fetch",
  "cross-fetch",
  "isomorphic-fetch",
  "undici",
  "got",
  "ky",
  "superagent",
  "request",
  "needle",
  "bent",
  "wretch",
];

const LLM_SDKS = [
  "openai",
  "ai",
  "ollama",
  "langchain",
  "cohere-ai",
  "groq-sdk",
  "replicate",
  "@google/generative-ai",
  "@google/genai",
  "@mistralai/mistralai",
  "@langchain/core",
  "@ai-sdk/openai",
  "@aws-sdk/client-bedrock-runtime",
];

const BANNED_PACKAGES = new Set([...HTTP_CLIENTS, ...LLM_SDKS]);

const isBannedPackage = (name: string): boolean =>
  BANNED_PACKAGES.has(name) ||
  /^@[^/]+-ai\//.test(name) ||
  name.startsWith("@langchain/") ||
  name.startsWith("@ai-sdk/") ||
  name.startsWith("@openai/");

const MODULE_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
const NETWORK_BUILTIN = /^(?:node:)?(?:http|https|net)$/;
const FETCH_CALL = /\bfetch\s*\(/;
const API_KEY_REFERENCE = /API[_-]?KEY/i;

const packageName = (specifier: string): string => {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
};

/** Returns one reason per problem found in a source text. */
const scanSource = (text: string): string[] => {
  const reasons: string[] = [];
  for (const match of text.matchAll(MODULE_SPECIFIER)) {
    const specifier = match[1] ?? "";
    if (NETWORK_BUILTIN.test(specifier)) reasons.push(`imports network built-in "${specifier}"`);
    else if (!specifier.startsWith(".") && isBannedPackage(packageName(specifier))) {
      reasons.push(`imports HTTP client or LLM SDK "${specifier}"`);
    }
  }
  if (FETCH_CALL.test(text)) reasons.push("calls fetch(");
  if (API_KEY_REFERENCE.test(text)) reasons.push("references an API key variable");
  return reasons;
};

/** Returns one reason per banned dependency in a package.json text. */
const scanManifest = (text: string): string[] => {
  const manifest: unknown = JSON.parse(text);
  if (typeof manifest !== "object" || manifest === null) return [];
  const reasons: string[] = [];
  for (const section of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    const deps = (manifest as Record<string, unknown>)[section];
    if (typeof deps !== "object" || deps === null) continue;
    for (const name of Object.keys(deps)) {
      if (isBannedPackage(name)) reasons.push(`${section} lists "${name}"`);
    }
  }
  return reasons;
};

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(?:ts|tsx|js|mjs|cjs|json)$/.test(entry.name) ? [path] : [];
  });

describe("9.11 the engine makes no network or LLM calls", () => {
  it("9.11 src/ has no network built-ins, HTTP clients, LLM SDKs, fetch( or API key variables", () => {
    const files = listSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
    const violations = files.flatMap((file) =>
      scanSource(readFileSync(file, "utf8")).map(
        (reason) => `${relative(ENGINE_DIR, file)}: ${reason}`,
      ),
    );
    expect(violations).toEqual([]);
  });

  it("9.11 package.json lists no HTTP client or LLM SDK", () => {
    const violations = scanManifest(readFileSync(PACKAGE_JSON, "utf8")).map(
      (reason) => `${relative(ENGINE_DIR, PACKAGE_JSON)}: ${reason}`,
    );
    expect(violations).toEqual([]);
  });

  it("9.11 the scanner flags each kind of banned source text", () => {
    expect(scanSource('import http from "node:http";')).toHaveLength(1);
    expect(scanSource('import https from "https";')).toHaveLength(1);
    expect(scanSource('const net = require("node:net");')).toHaveLength(1);
    expect(scanSource('import axios from "axios";')).toHaveLength(1);
    expect(scanSource('import OpenAI from "openai";')).toHaveLength(1);
    expect(scanSource('import A from "@example-ai/sdk";')).toHaveLength(1);
    expect(scanSource('const m = await import("undici");')).toHaveLength(1);
    expect(scanSource("const r = await fetch(url);")).toHaveLength(1);
    expect(scanSource("const k = process.env.EXAMPLE_API_KEY;")).toHaveLength(1);
    expect(scanSource("const k = process.env.EXAMPLE_APIKEY;")).toHaveLength(1);
  });

  it("9.11 the scanner accepts ordinary imports", () => {
    const text = [
      'import { readFile } from "node:fs/promises";',
      'import { z } from "zod";',
      'import { parse } from "./parse.js";',
      'import { spawn } from "node:child_process";',
      "const prefetched = prefetch(1);",
    ].join("\n");
    expect(scanSource(text)).toEqual([]);
  });

  it("9.11 the manifest scanner flags banned dependencies and accepts the current kinds", () => {
    expect(scanManifest('{"dependencies":{"axios":"1.0.0"}}')).toHaveLength(1);
    expect(scanManifest('{"devDependencies":{"@example-ai/sdk":"1.0.0"}}')).toHaveLength(1);
    expect(
      scanManifest('{"dependencies":{"zod":"4.0.0","@stryker-mutator/core":"1.0.0"}}'),
    ).toEqual([]);
  });
});
