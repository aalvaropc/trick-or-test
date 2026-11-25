import { afterEach, describe, expect, it, vi } from "vitest";
import { readFiles } from "../../src/loader/file-reader.js";

const LIMIT = 52_428_800;

/** A File whose reported size is `size` without allocating that many bytes. */
const fakeFile = (name: string, size: number, text = "x"): File => {
  const f = new File([text], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("file-reader", () => {
  it("1.11 a file of exactly 52,428,800 bytes is read", async () => {
    const [r] = await readFiles([fakeFile("edge.json", LIMIT, "hello")]);
    expect(r).toEqual({ ok: true, value: { fileName: "edge.json", text: "hello" } });
  });

  it("1.11 a file of 52,428,801 bytes is rejected without reading it", async () => {
    const textSpy = vi.spyOn(File.prototype, "text");
    const readerSpy = vi.fn();
    vi.stubGlobal("FileReader", readerSpy);
    const [r] = await readFiles([fakeFile("big.json", LIMIT + 1)]);
    expect(r?.ok).toBe(false);
    if (r && !r.ok) {
      expect(r.error.fileName).toBe("big.json");
      expect(r.error.message).toContain("big.json");
      expect(r.error.message).toContain("50 MB");
    }
    expect(textSpy).not.toHaveBeenCalled();
    expect(readerSpy).not.toHaveBeenCalled();
  });

  it("1.1 fetch is never called", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await readFiles([fakeFile("a.json", 1), fakeFile("b.json", LIMIT + 1)]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("12.14 a read failure becomes a LoadError and does not hide other files", async () => {
    const bad = fakeFile("bad.json", 1);
    vi.spyOn(bad, "text").mockRejectedValue(new Error("boom"));
    const good = fakeFile("good.json", 1, "ok");
    const results = await readFiles([bad, good]);
    expect(results[0]).toEqual({
      ok: false,
      error: { fileName: "bad.json", message: expect.stringContaining("bad.json") },
    });
    expect(results[1]).toEqual({ ok: true, value: { fileName: "good.json", text: "ok" } });
  });
});
