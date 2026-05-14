import { checkAllOfficialStatuses } from "../../../lib/official-status";
import type { WorkerProviderType } from "../providers";
import { runD1Batches } from "./d1-batch";

export type OfficialStatusCheckResult = {
  status: "operational" | "degraded" | "down" | "unknown";
  message: string;
  checkedAt: string;
  affectedComponents?: string[];
};

export type OfficialStatusChecker = (
  providers: WorkerProviderType[]
) => Promise<Map<string, OfficialStatusCheckResult>>;

interface D1BatchExecutor {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface OfficialStatusSnapshotWriteSummary {
  writtenSnapshots: number;
}

const OFFICIAL_STATUS_PROVIDERS: WorkerProviderType[] = [
  "openai",
  "gemini",
  "anthropic",
];

export async function writeOfficialStatusSnapshots(
  db: D1BatchExecutor,
  checker: OfficialStatusChecker = checkAllOfficialStatuses
): Promise<OfficialStatusSnapshotWriteSummary> {
  const results = await checker(OFFICIAL_STATUS_PROVIDERS);
  const statements: D1PreparedStatement[] = [];

  for (const [provider, result] of results) {
    statements.push(
      db
        .prepare(
          `INSERT INTO official_status_snapshots (
             provider,
             status,
             message,
             affected_components_json,
             checked_at_ms
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(provider) DO UPDATE SET
             status = excluded.status,
             message = excluded.message,
             affected_components_json = excluded.affected_components_json,
             checked_at_ms = excluded.checked_at_ms`
        )
        .bind(
          provider,
          result.status,
          result.message,
          result.affectedComponents
            ? JSON.stringify(result.affectedComponents)
            : null,
          Date.parse(result.checkedAt)
        )
    );
  }

  if (statements.length > 0) {
    await runD1Batches(db, statements);
  }

  return { writtenSnapshots: statements.length };
}
