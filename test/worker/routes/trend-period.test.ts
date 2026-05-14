import { describe, expect, it } from "vitest";

import { parseTrendPeriod } from "../../../src/worker/routes/trend-period";

describe("parseTrendPeriod", () => {
  it("treats empty trendPeriod as the default period", () => {
    expect(parseTrendPeriod("")).toBe("7d");
  });
});
