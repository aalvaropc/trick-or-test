import { describe, expect, it } from "vitest";
import { withSize } from "../../src/bestiary/with-size.js";

const BASE = '<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 10 10">';
const REST = '<title>t</title><path d="M0 0"/></svg>';

describe("withSize", () => {
  it("13.26 adds width and height to the root tag", () => {
    const out = withSize(BASE + REST, 48);
    expect(out).toContain('width="48"');
    expect(out).toContain('height="48"');
    expect(out.startsWith("<svg")).toBe(true);
  });

  it("13.26 replaces existing width and height", () => {
    const out = withSize(`<svg width="1" height="2" viewBox="0 0 1 1">${REST}`, 96);
    expect(out.match(/width=/g)).toHaveLength(1);
    expect(out.match(/height=/g)).toHaveLength(1);
    expect(out).toContain('width="96"');
    expect(out).toContain('height="96"');
  });

  it("13.26 changes only the root tag", () => {
    const out = withSize(BASE + REST, 56);
    expect(out.endsWith(REST)).toBe(true);
    expect(out.replace(/ width="56"| height="56"/g, "")).toBe(BASE + REST);
  });

  it("13.26 a string without <svg comes back unchanged", () => {
    expect(withSize("<g></g>", 56)).toBe("<g></g>");
    expect(withSize("", 56)).toBe("");
  });

  it("13.26 a title with < in it is untouched", () => {
    const svg = `${BASE}<title>a &lt; b &lt;svg width="9"&gt;</title></svg>`;
    const out = withSize(svg, 64);
    expect(out.slice(out.indexOf("<title>"))).toBe(svg.slice(svg.indexOf("<title>")));
  });
});
