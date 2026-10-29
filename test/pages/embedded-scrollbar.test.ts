import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

// 首页被 iframe 内嵌时隐藏文档滚动条：行内脚本在首屏前标记根元素，样式只对该标记生效。
describe("embedded status page scrollbar", () => {
  it("marks the root element before first paint when framed", async () => {
    const source = await readFile("src/pages/index.astro", "utf8");

    const script = source.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1] ?? "";
    expect(script).toContain("window.self !== window.top");
    expect(script).toContain('setAttribute("data-embedded", "")');
    // 标记脚本在 <body> 之前，避免滚动条先出现再消失。
    expect(source.indexOf("data-embedded")).toBeLessThan(source.indexOf("<body>"));
  });

  it("hides the document scrollbar only for the embedded marker", async () => {
    const css = await readFile("src/styles/global.css", "utf8");

    expect(css).toMatch(/html\[data-embedded\]\s*\{[^}]*scrollbar-width:\s*none/);
    expect(css).toMatch(/html\[data-embedded\]::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
    // 独立打开（无标记）时不隐藏滚动条。
    expect(css).not.toMatch(/(^|\n)html\s*\{[^}]*scrollbar-width:\s*none/);
    expect(css).not.toMatch(/(^|\n)body\s*\{[^}]*scrollbar-width:\s*none/);
  });

  it("does not apply the marker to the admin page", async () => {
    const admin = await readFile("src/pages/admin.astro", "utf8");

    expect(admin).not.toContain("data-embedded");
  });
});
