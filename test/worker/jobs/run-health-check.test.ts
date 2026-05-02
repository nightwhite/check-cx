import { describe, expect, it } from "vitest";

import { shouldPruneCheckHistory } from "../../../src/worker/jobs/run-health-check";

describe("runHealthCheckJob", () => {
  it("only prunes history on hourly scheduled runs", () => {
    expect(
      shouldPruneCheckHistory(Date.parse("2026-05-03T01:00:00.000Z"))
    ).toBe(true);
    expect(
      shouldPruneCheckHistory(Date.parse("2026-05-03T01:01:00.000Z"))
    ).toBe(false);
    expect(
      shouldPruneCheckHistory(Date.parse("2026-05-03T01:59:59.999Z"))
    ).toBe(false);
  });
});
