import { launch, type BrowserWorker } from "@cloudflare/puppeteer";

import type { TrendPeriod } from "./trend-period";

const SCREENSHOT_READY_SELECTOR = "[data-dashboard-ready='true']";

function buildDashboardScreenshotUrl(request: Request, period: TrendPeriod): string {
  const url = new URL(request.url);
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("period", period);
  url.searchParams.set("screenshot", "1");
  return url.toString();
}

export async function renderPublicStatusScreenshotPng(
  browserBinding: BrowserWorker,
  request: Request,
  period: TrendPeriod
): Promise<Uint8Array> {
  const browser = await launch(browserBinding);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
    await page.emulateMediaType("screen");
    await page.setCacheEnabled(false);
    await page.setExtraHTTPHeaders({
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    });
    await page.goto(buildDashboardScreenshotUrl(request, period), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(SCREENSHOT_READY_SELECTOR, { timeout: 10_000 });

    return await page.screenshot({
      type: "png",
      fullPage: true,
      captureBeyondViewport: true,
    });
  } finally {
    await browser.close();
  }
}
