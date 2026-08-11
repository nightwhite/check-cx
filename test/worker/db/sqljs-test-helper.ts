import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import initSqlJs from "sql.js";

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
type SqlJsDatabase = InstanceType<SqlJsStatic["Database"]>;
type SqlJsBindParams = Parameters<SqlJsDatabase["run"]>[1];

export interface StatementSyncLike {
  all(...values: unknown[]): Array<Record<string, unknown>>;
  get(...values: unknown[]): Record<string, unknown> | undefined;
  run(...values: unknown[]): unknown;
}

export interface DatabaseLike {
  exec(query: string): void;
  prepare(query: string): StatementSyncLike;
  getRowsModified(): number;
}

let sqlPromise: Promise<SqlJsStatic> | null = null;

function getSqlJs() {
  sqlPromise ??= initSqlJs();
  return sqlPromise;
}

function toSqlParams(values: unknown[]): SqlJsBindParams {
  return values.map((value) => {
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    return value;
  }) as SqlJsBindParams;
}

function rowsFromResult(
  result: ReturnType<SqlJsDatabase["exec"]>[number] | undefined
) {
  if (!result) {
    return [];
  }

  return result.values.map((values) =>
    Object.fromEntries(
      result.columns.map((column, index) => [column, values[index]])
    )
  );
}

class SqlJsStatementAdapter implements StatementSyncLike {
  constructor(
    private readonly db: SqlJsDatabase,
    private readonly query: string
  ) {}

  all(...values: unknown[]) {
    return rowsFromResult(this.db.exec(this.query, toSqlParams(values))[0]);
  }

  get(...values: unknown[]) {
    return this.all(...values)[0];
  }

  run(...values: unknown[]) {
    this.db.run(this.query, toSqlParams(values));
    return { changes: this.db.getRowsModified() };
  }
}

class SqlJsDatabaseAdapter implements DatabaseLike {
  constructor(private readonly db: SqlJsDatabase) {}

  exec(query: string) {
    this.db.exec(query);
  }

  prepare(query: string) {
    return new SqlJsStatementAdapter(this.db, query);
  }

  getRowsModified() {
    return this.db.getRowsModified();
  }
}

const migrationDirectory = resolve(
  process.cwd(),
  "drizzle/migrations"
);

export async function createMigratedDatabase() {
  const SQL = await getSqlJs();
  const db = new SqlJsDatabaseAdapter(new SQL.Database());
  db.exec("PRAGMA foreign_keys = ON;");
  for (const file of readdirSync(migrationDirectory)
    .filter((item) => item.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(resolve(migrationDirectory, file), "utf8"));
  }
  return db;
}
