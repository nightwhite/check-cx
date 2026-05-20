import { readFileSync } from "node:fs";

import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";

function parseWranglerConfig() {
  return parse(readFileSync("wrangler.jsonc", "utf8")) as {
    assets?: {
      not_found_handling?: string;
      run_worker_first?: string[] | boolean;
    };
  };
}

describe("wrangler static assets routing", () => {
  it("routes API and canonical group requests to the worker before SPA asset handling", () => {
    const config = parseWranglerConfig();

    expect(config.assets?.not_found_handling).toBe("single-page-application");
    expect(config.assets?.run_worker_first).toEqual(
      expect.arrayContaining(["/api/*", "/group/SU8", "/group/SU8/"])
    );
  });
});
