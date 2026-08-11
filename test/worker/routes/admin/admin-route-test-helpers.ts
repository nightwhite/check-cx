import { expect } from "vitest";

import { createWorkerApp } from "../../../../src/worker/app";
import {
  createMigratedDatabase,
  type DatabaseLike,
  type StatementSyncLike,
} from "../../db/sqljs-test-helper";

class D1StatementForSqlite {
  constructor(
    private readonly statement: StatementSyncLike,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new D1StatementForSqlite(this.statement, values);
  }

  async all<T>() {
    return { results: this.statement.all(...this.values) as T[] };
  }

  async first<T>() {
    return (this.statement.get(...this.values) ?? null) as T | null;
  }

  async run() {
    const result = this.statement.run(...this.values) as
      | { changes?: number }
      | undefined;
    return { meta: { changes: result?.changes ?? 0 } };
  }
}

class D1SqliteAdapter {
  constructor(private readonly db: DatabaseLike) {}

  prepare(query: string) {
    return new D1StatementForSqlite(this.db.prepare(query));
  }
}

export async function createAdminRouteEnv() {
  return {
    ADMIN_TOKEN: "secret-admin-token",
    CONFIG_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
    DB: new D1SqliteAdapter(await createMigratedDatabase()),
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as Env;
}

export async function loginAdmin(
  app: ReturnType<typeof createWorkerApp>,
  env: Env
) {
  const response = await app.request(
    "http://example.com/api/admin/session",
    {
      method: "POST",
      body: JSON.stringify({ token: "secret-admin-token" }),
      headers: { "Content-Type": "application/json" },
    },
    env
  );

  expect(response.status).toBe(200);
  return response.headers.get("Set-Cookie") ?? "";
}

export function jsonRequest(method: string, cookie: string, body: unknown) {
  return {
    method,
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
  };
}
