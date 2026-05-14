import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  buildAllD1ImportStatements,
  buildCheckConfigStatements,
  buildAvailabilityRollupStatementsFromHistory,
  serializeD1Statements,
} from "../../scripts/migration/import-d1";

async function writeJsonl(
  dir: string,
  table: string,
  rows: Array<Record<string, unknown>>
) {
  await writeFile(
    join(dir, `${table}.jsonl`),
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n"
  );
}

describe("D1 import statements", () => {
  it("builds executable SQL without plaintext provider keys", async () => {
    const dir = await mkdtemp(join(tmpdir(), "check-cx-import-"));
    try {
      await writeJsonl(dir, "check_request_templates", [
        {
          id: "template-1",
          name: "OpenAI",
          type: "openai",
          request_header: { "x-test": "1" },
          metadata: { temperature: 0 },
          created_at: "2026-05-02T00:00:00.000Z",
          updated_at: "2026-05-02T00:00:00.000Z",
        },
      ]);
      await writeJsonl(dir, "check_models", [
        {
          id: "model-1",
          type: "openai",
          model: "gpt-4o-mini",
          template_id: "template-1",
          created_at: "2026-05-02T00:00:00.000Z",
          updated_at: "2026-05-02T00:00:00.000Z",
        },
      ]);
      await writeJsonl(dir, "check_configs", [
        {
          id: "config-1",
          name: "OpenAI",
          type: "openai",
          model_id: "model-1",
          endpoint: "https://api.openai.com/v1/chat/completions",
          api_key: "sk-plain",
          enabled: true,
          is_maintenance: false,
          group_name: "core",
          created_at: "2026-05-02T00:00:00.000Z",
          updated_at: "2026-05-02T00:00:00.000Z",
        },
      ]);
      await writeJsonl(dir, "check_history", [
        {
          id: 1,
          config_id: "config-1",
          status: "operational",
          latency_ms: 100,
          ping_latency_ms: 10,
          checked_at: "2026-05-02T00:01:00.000Z",
          message: "OK",
        },
      ]);
      await writeJsonl(dir, "group_info", []);
      await writeJsonl(dir, "system_notifications", []);

      const statements = await buildAllD1ImportStatements(
        dir,
        "0123456789abcdef0123456789abcdef"
      );
      const sql = serializeD1Statements(statements);

      expect(sql).toContain("INSERT INTO check_configs");
      expect(sql).toContain("INSERT INTO check_latest");
      expect(sql).toContain("INSERT INTO availability_rollups");
      expect(sql).not.toContain("sk-plain");
      expect(sql).not.toContain("-- params:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("allows keyless maintenance configs without writing a plaintext key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "check-cx-import-"));
    try {
      await writeJsonl(dir, "check_configs", [
        {
          id: "config-maintenance",
          name: "Maintenance",
          type: "openai",
          model_id: "model-1",
          endpoint: "https://api.openai.com/v1/chat/completions",
          api_key: "",
          enabled: true,
          is_maintenance: true,
          group_name: "core",
          created_at: "2026-05-02T00:00:00.000Z",
          updated_at: "2026-05-02T00:00:00.000Z",
        },
      ]);

      const statements = await buildCheckConfigStatements(
        dir,
        "0123456789abcdef0123456789abcdef"
      );

      expect(statements).toHaveLength(1);
      expect(statements[0].params).not.toContain("");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("backfills availability rollups from imported history", async () => {
    const dir = await mkdtemp(join(tmpdir(), "check-cx-import-"));
    try {
      await writeJsonl(dir, "check_history", [
        {
          id: "history-1",
          config_id: "config-1",
          status: "operational",
          latency_ms: 100,
          ping_latency_ms: 10,
          checked_at: "2026-05-02T03:04:05.000Z",
          message: "OK",
        },
        {
          id: "history-2",
          config_id: "config-1",
          status: "failed",
          latency_ms: null,
          ping_latency_ms: 10,
          checked_at: "2026-05-02T04:04:05.000Z",
          message: "failed",
        },
      ]);

      const statements = await buildAvailabilityRollupStatementsFromHistory(dir);

      expect(statements).toHaveLength(3);
      expect(statements[0]).toMatchObject({
        sql: expect.stringContaining("INSERT INTO availability_rollups"),
        params: [
          "config-1",
          "7d",
          Date.parse("2026-05-02T00:00:00.000Z"),
          2,
          1,
          Date.parse("2026-05-02T00:00:00.000Z"),
        ],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
