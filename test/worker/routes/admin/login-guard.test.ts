import { describe, expect, it } from "vitest";

import {
  createLoginGuard,
  getClientIp,
} from "../../../../src/worker/routes/admin/login-guard";
import { createAdminRouteEnv } from "./admin-route-test-helpers";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

async function createGuard(start = Date.parse("2026-10-17T00:00:00.000Z")) {
  const env = await createAdminRouteEnv();
  let nowMs = start;
  const guard = createLoginGuard(env.DB, () => nowMs);
  return {
    guard,
    advance(ms: number) {
      nowMs += ms;
    },
  };
}

async function failTimes(
  guard: Awaited<ReturnType<typeof createGuard>>["guard"],
  ip: string,
  count: number
) {
  let result = null;
  for (let index = 0; index < count; index++) {
    result = await guard.recordFailure(ip);
  }
  return result;
}

describe("admin login guard", () => {
  it("reads the client IP from CF-Connecting-IP", () => {
    expect(
      getClientIp(
        new Request("http://example.com", {
          headers: { "CF-Connecting-IP": "203.0.113.5" },
        })
      )
    ).toBe("203.0.113.5");
    expect(getClientIp(new Request("http://example.com"))).toBe("unknown");
  });

  it("restarts the failure window after 15 minutes", async () => {
    const { guard, advance } = await createGuard();

    await failTimes(guard, "1.1.1.1", 4);
    advance(15 * MINUTE_MS);
    await expect(guard.recordFailure("1.1.1.1")).resolves.toEqual({
      locked: false,
      remainingAttempts: 4,
    });
  });

  it("caps the lock duration at 24 hours", async () => {
    const { guard, advance } = await createGuard();

    let retryAfterSeconds = 0;
    for (let round = 0; round < 10; round++) {
      const result = await failTimes(guard, "1.1.1.1", 5);
      expect(result?.locked).toBe(true);
      retryAfterSeconds = result && result.locked ? result.retryAfterSeconds : 0;
      advance(retryAfterSeconds * 1000);
    }
    expect(retryAfterSeconds).toBe(24 * 60 * 60);
  });

  it("resets the lock count after 24 quiet hours", async () => {
    const { guard, advance } = await createGuard();

    await failTimes(guard, "1.1.1.1", 5);
    advance(15 * MINUTE_MS);
    await failTimes(guard, "1.1.1.1", 5);
    advance(24 * HOUR_MS + 1);
    await expect(failTimes(guard, "1.1.1.1", 5)).resolves.toEqual({
      locked: true,
      retryAfterSeconds: 15 * 60,
    });
  });

  it("reports and expires locks", async () => {
    const { guard, advance } = await createGuard();

    await expect(guard.checkLocked("1.1.1.1")).resolves.toEqual({ locked: false });
    await failTimes(guard, "1.1.1.1", 5);
    advance(10 * MINUTE_MS);
    await expect(guard.checkLocked("1.1.1.1")).resolves.toEqual({
      locked: true,
      retryAfterSeconds: 5 * 60,
    });
    advance(5 * MINUTE_MS);
    await expect(guard.checkLocked("1.1.1.1")).resolves.toEqual({ locked: false });
  });

  it("releases the global pause after 60 seconds", async () => {
    const { guard, advance } = await createGuard();

    for (let index = 0; index < 30; index++) {
      await guard.recordFailure(`10.0.0.${index}`);
    }
    await expect(guard.checkLocked("192.0.2.1")).resolves.toEqual({
      locked: true,
      retryAfterSeconds: 60,
    });
    advance(MINUTE_MS);
    await expect(guard.checkLocked("192.0.2.1")).resolves.toEqual({
      locked: false,
    });
  });
});
