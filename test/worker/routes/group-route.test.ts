import { describe, expect, it } from "vitest";

import { createWorkerApp } from "../../../src/worker/app";

describe("group route", () => {
  it("returns 400 for malformed percent encoding in groupName", async () => {
    const app = createWorkerApp();

    const response = await app.request(
      "http://example.com/api/group/%E0%A4%A?trendPeriod=7d",
      {},
      {
        DB: { prepare: () => {
          throw new Error("DB should not be queried");
        } },
        ASSETS: { fetch: async () => new Response("asset") },
      } as unknown as Env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_group_name",
    });
  });
});
