import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const pages = ["src/pages/index.astro", "src/pages/admin.astro"];

describe("page favicon head", () => {
  it.each(pages)("uses the configured favicon endpoint in %s", async (page) => {
    const source = await readFile(page, "utf8");

    expect(source).toContain('<link rel="icon" href="/favicon.ico?v=site"');
    expect(source).not.toContain('href="/favicon.png"');
  });
});
