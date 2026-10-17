const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const IP_MAX_FAILURES = 5;
export const IP_WINDOW_MS = 15 * MINUTE_MS;
export const IP_BASE_LOCK_MS = 15 * MINUTE_MS;
export const IP_MAX_LOCK_MS = 24 * HOUR_MS;
export const LOCK_COUNT_RESET_MS = 24 * HOUR_MS;
export const GLOBAL_KEY = "global";
export const GLOBAL_MAX_FAILURES = 30;
export const GLOBAL_WINDOW_MS = MINUTE_MS;
export const GLOBAL_LOCK_MS = MINUTE_MS;

interface LoginGuardStatement {
  bind(...values: unknown[]): LoginGuardStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface LoginGuardExecutor {
  prepare(query: string): LoginGuardStatement;
}

interface AttemptRow {
  key: string;
  failures: number;
  window_started_at_ms: number;
  locked_until_ms: number | null;
  lock_count: number;
  updated_at_ms: number;
}

interface AttemptPolicy {
  maxFailures: number;
  windowMs: number;
  lockDurationMs(lockCount: number): number;
}

const IP_POLICY: AttemptPolicy = {
  maxFailures: IP_MAX_FAILURES,
  windowMs: IP_WINDOW_MS,
  lockDurationMs: (lockCount) =>
    Math.min(IP_BASE_LOCK_MS * 2 ** Math.max(0, lockCount - 1), IP_MAX_LOCK_MS),
};

const GLOBAL_POLICY: AttemptPolicy = {
  maxFailures: GLOBAL_MAX_FAILURES,
  windowMs: GLOBAL_WINDOW_MS,
  lockDurationMs: () => GLOBAL_LOCK_MS,
};

export type LoginLockState =
  | { locked: true; retryAfterSeconds: number }
  | { locked: false };

export type LoginFailureResult =
  | { locked: true; retryAfterSeconds: number }
  | { locked: false; remainingAttempts: number };

export function getClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
}

function ipKey(ip: string): string {
  return `ip:${ip}`;
}

function retryAfterSeconds(lockedUntilMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 1000));
}

function activeLockUntil(row: AttemptRow | null, nowMs: number): number | null {
  if (!row?.locked_until_ms || row.locked_until_ms <= nowMs) {
    return null;
  }
  return row.locked_until_ms;
}

// 登录失败按 IP 计数，连续锁定时长翻倍；另设全局计数兜底分布式爆破。
export function createLoginGuard(
  db: LoginGuardExecutor,
  now: () => number = Date.now
) {
  async function find(key: string) {
    return db
      .prepare(
        `SELECT key, failures, window_started_at_ms, locked_until_ms, lock_count, updated_at_ms
         FROM admin_login_attempts
         WHERE key = ?`
      )
      .bind(key)
      .first<AttemptRow>();
  }

  async function recordKeyFailure(
    key: string,
    policy: AttemptPolicy,
    nowMs: number
  ) {
    const row = await find(key);
    let failures = row?.failures ?? 0;
    let windowStartedAtMs = row?.window_started_at_ms ?? nowMs;
    let lockCount = row?.lock_count ?? 0;
    let lockedUntilMs = row?.locked_until_ms ?? null;

    if (row && nowMs - row.updated_at_ms > LOCK_COUNT_RESET_MS) {
      lockCount = 0;
    }
    if (nowMs - windowStartedAtMs >= policy.windowMs) {
      failures = 0;
      windowStartedAtMs = nowMs;
    }

    failures += 1;
    let lockedNow = false;
    if (failures >= policy.maxFailures) {
      lockCount += 1;
      lockedUntilMs = nowMs + policy.lockDurationMs(lockCount);
      failures = 0;
      windowStartedAtMs = nowMs;
      lockedNow = true;
    }

    await db
      .prepare(
        `INSERT INTO admin_login_attempts
           (key, failures, window_started_at_ms, locked_until_ms, lock_count, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           failures = excluded.failures,
           window_started_at_ms = excluded.window_started_at_ms,
           locked_until_ms = excluded.locked_until_ms,
           lock_count = excluded.lock_count,
           updated_at_ms = excluded.updated_at_ms`
      )
      .bind(key, failures, windowStartedAtMs, lockedUntilMs, lockCount, nowMs)
      .run();

    return {
      lockedUntilMs: lockedNow ? lockedUntilMs : null,
      remainingAttempts: policy.maxFailures - failures,
    };
  }

  return {
    async checkLocked(ip: string): Promise<LoginLockState> {
      const nowMs = now();
      const [ipRow, globalRow] = await Promise.all([
        find(ipKey(ip)),
        find(GLOBAL_KEY),
      ]);
      const lockedUntil = Math.max(
        activeLockUntil(ipRow, nowMs) ?? 0,
        activeLockUntil(globalRow, nowMs) ?? 0
      );
      return lockedUntil > 0
        ? { locked: true, retryAfterSeconds: retryAfterSeconds(lockedUntil, nowMs) }
        : { locked: false };
    },

    async recordFailure(ip: string): Promise<LoginFailureResult> {
      const nowMs = now();
      const ipResult = await recordKeyFailure(ipKey(ip), IP_POLICY, nowMs);
      const globalResult = await recordKeyFailure(GLOBAL_KEY, GLOBAL_POLICY, nowMs);
      const lockedUntil = Math.max(
        ipResult.lockedUntilMs ?? 0,
        globalResult.lockedUntilMs ?? 0
      );
      return lockedUntil > 0
        ? { locked: true, retryAfterSeconds: retryAfterSeconds(lockedUntil, nowMs) }
        : { locked: false, remainingAttempts: ipResult.remainingAttempts };
    },

    async clear(ip: string): Promise<void> {
      await db
        .prepare("DELETE FROM admin_login_attempts WHERE key = ?")
        .bind(ipKey(ip))
        .run();
    },
  };
}

// 24 小时无更新的记录：锁定已过期且 lock_count 会被重置，可以安全删除。
export async function pruneLoginAttempts(
  db: LoginGuardExecutor,
  nowMs: number
): Promise<void> {
  await db
    .prepare("DELETE FROM admin_login_attempts WHERE updated_at_ms < ?")
    .bind(nowMs - LOCK_COUNT_RESET_MS)
    .run();
}
