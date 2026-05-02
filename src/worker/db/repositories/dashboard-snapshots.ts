export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface D1Executor {
  prepare(query: string): D1StatementLike;
}

export interface DashboardSnapshotRecord {
  snapshotKey: string;
  period: string;
  payloadJson: string;
  etag: string;
  generatedAtMs: number;
}

interface DashboardSnapshotRow {
  snapshot_key: string;
  period: string;
  payload_json: string;
  etag: string;
  generated_at_ms: number;
}

const toRecord = (row: DashboardSnapshotRow): DashboardSnapshotRecord => ({
  snapshotKey: row.snapshot_key,
  period: row.period,
  payloadJson: row.payload_json,
  etag: row.etag,
  generatedAtMs: row.generated_at_ms,
});

export function createDashboardSnapshotRepository(db: D1Executor) {
  return {
    async upsert(record: DashboardSnapshotRecord) {
      await db
        .prepare(
          `INSERT INTO dashboard_snapshots (snapshot_key, period, payload_json, etag, generated_at_ms)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(snapshot_key, period) DO UPDATE SET
             payload_json = excluded.payload_json,
             etag = excluded.etag,
             generated_at_ms = excluded.generated_at_ms`
        )
        .bind(
          record.snapshotKey,
          record.period,
          record.payloadJson,
          record.etag,
          record.generatedAtMs
        )
        .run();
    },

    async find(snapshotKey: string, period: string) {
      const row = await db
        .prepare(
          `SELECT snapshot_key, period, payload_json, etag, generated_at_ms
           FROM dashboard_snapshots
           WHERE snapshot_key = ? AND period = ?`
        )
        .bind(snapshotKey, period)
        .first<DashboardSnapshotRow>();

      return row ? toRecord(row) : null;
    },

    async pruneBefore(cutoffMs: number) {
      const result = await db
        .prepare("DELETE FROM dashboard_snapshots WHERE generated_at_ms < ?")
        .bind(cutoffMs)
        .run();

      return result.meta?.changes ?? 0;
    },
  };
}
