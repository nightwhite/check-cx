import { describe, expect, it } from "vitest";

import { runProviderChecks } from "../../../src/worker/jobs/run-checks";
import type { WorkerCheckResult, WorkerProviderConfig } from "../../../src/worker/providers";

function createConfig(id: string): WorkerProviderConfig {
  return {
    id,
    name: id,
    type: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    apiKey: "sk-test",
    isMaintenance: false,
  };
}

function createResult(config: WorkerProviderConfig): WorkerCheckResult {
  return {
    id: config.id,
    name: config.name,
    type: config.type,
    endpoint: config.endpoint,
    model: config.model,
    status: "operational",
    latencyMs: 100,
    pingLatencyMs: 10,
    checkedAt: "2026-05-02T00:00:00.000Z",
    message: "OK",
  };
}

describe("runProviderChecks", () => {
  it("runs enabled checks with bounded concurrency and skips maintenance configs", async () => {
    let active = 0;
    let maxActive = 0;
    const started: string[] = [];

    const results = await runProviderChecks(
      [createConfig("a"), createConfig("b"), createConfig("c"), {
        ...createConfig("maintenance"),
        isMaintenance: true,
      }],
      async (config) => {
        active++;
        maxActive = Math.max(maxActive, active);
        started.push(config.id);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return createResult(config);
      },
      2
    );

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(started).toEqual(["a", "b", "c"]);
    expect(results.map((result) => result.id)).toEqual(["a", "b", "c"]);
  });
});
