import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("wrangler static assets routing", () => {
  it("routes API requests to the worker before SPA asset handling", () => {
    const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8")) as {
      assets?: {
        not_found_handling?: string;
        run_worker_first?: string[] | boolean;
      };
    };

    expect(config.assets?.not_found_handling).toBe("single-page-application");
    expect(config.assets?.run_worker_first).toEqual(
      expect.arrayContaining(["/api/*"])
    );
  });
});
