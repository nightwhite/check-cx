import { describe, expect, it } from "vitest";

import { createWorkerApp } from "../../src/worker/app";

describe("worker health route", () => {
  it("returns the check-cx worker health payload", async () => {
    const app = createWorkerApp();

    const response = await app.request("http://example.com/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "check-cx-workers",
    });
  });
});
