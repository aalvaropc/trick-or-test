import { describe, expect, it } from "vitest";
import { escapeXml } from "../../src/bestiary/escape-xml.js";

describe("escapeXml", () => {
  it("5.14 escapes & to &amp;", () => {
    expect(escapeXml("&")).toBe("&amp;");
  });

  it("5.14 escapes < to &lt;", () => {
    expect(escapeXml("<")).toBe("&lt;");
  });

  it("5.14 escapes > to &gt;", () => {
    expect(escapeXml(">")).toBe("&gt;");
  });

  it('5.14 escapes " to &quot;', () => {
    expect(escapeXml('"')).toBe("&quot;");
  });

  it("5.14 escapes ' to &#39;", () => {
    expect(escapeXml("'")).toBe("&#39;");
  });

  it("5.14 escapes the ampersand first, with no double escaping", () => {
    expect(escapeXml("<&>")).toBe("&lt;&amp;&gt;");
    expect(escapeXml("&lt;")).toBe("&amp;lt;");
    expect(escapeXml(`a'b"c`)).toBe("a&#39;b&quot;c");
  });

  it("5.14 returns the empty string unchanged", () => {
    expect(escapeXml("")).toBe("");
  });
});
