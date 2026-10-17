import { describe, expect, it } from "vitest";

import {
  getPagePeriod,
  injectDashboardHtml,
  renderDashboardPage,
} from "../../src/worker/pages/index-html";

const html =
  '<html><head><title>SU8 Status</title><meta name="description" content="SU8 AI provider health status"><link rel="icon" href="/favicon.ico?v=site" sizes="any"></head><body></body></html>';

const payload = {
  site: {
    statusTitle: "Acme <Status>",
    description: 'Live "status"',
    faviconUrl: "https://cdn.example.com/icon.png",
  },
  channels: [{ id: "c", name: "</script><script>alert(1)</script>" }],
  providerTimelines: [{ id: "x" }],
  trendPeriod: "30d",
};

function readInlineData(result: string) {
  const match = result.match(
    /<script type="application\/json" id="dashboard-initial-data">([\s\S]*?)<\/script>/
  );
  return match ? JSON.parse(match[1]) : null;
}

describe("dashboard page html injection", () => {
  it("applies site metadata and escapes it", () => {
    const result = injectDashboardHtml(html, payload);

    expect(result).toContain("<title>Acme &lt;Status&gt;</title>");
    expect(result).toContain('<meta name="description" content="Live &quot;status&quot;">');
    expect(result).not.toContain("favicon.ico?v=site");
    expect(result).toMatch(/href="\/favicon\.ico\?v=[a-z0-9]+"/);
  });

  it("inlines compact snapshot data without breaking out of the script tag", () => {
    const result = injectDashboardHtml(html, payload);

    expect(result).not.toContain("</script><script>alert(1)");
    const data = readInlineData(result);
    expect(data.channels[0].name).toBe("</script><script>alert(1)</script>");
    expect(data.providerTimelines).toBeUndefined();
  });

  it("leaves the page untouched when no snapshot exists", () => {
    expect(injectDashboardHtml(html, null)).toBe(html);
  });

  it("reads the page period from the URL with 30d as default", () => {
    expect(getPagePeriod(new URL("http://x/"))).toBe("30d");
    expect(getPagePeriod(new URL("http://x/?period=7d"))).toBe("7d");
    expect(getPagePeriod(new URL("http://x/?period=bad"))).toBe("30d");
  });

  it("renders the page with the snapshot for the requested period", async () => {
    const queried: unknown[][] = [];
    const env = {
      DB: {
        prepare() {
          return {
            bind(...values: unknown[]) {
              queried.push(values);
              return {
                first: async () => ({ payload_json: JSON.stringify(payload) }),
              };
            },
          };
        },
      },
    } as unknown as Env;

    const response = await renderDashboardPage(
      new Request("http://example.com/?period=15d"),
      env,
      new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
    );

    expect(queried).toEqual([["dashboard", "15d"]]);
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(readInlineData(await response.text())).not.toBeNull();
  });

  it("keeps screenshot mode on the static page", async () => {
    const asset = new Response(html, { headers: { "Content-Type": "text/html" } });
    const response = await renderDashboardPage(
      new Request("http://example.com/?screenshot=1"),
      {} as Env,
      asset
    );

    expect(response).toBe(asset);
  });
});
