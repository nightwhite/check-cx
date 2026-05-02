import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

const DEFAULT_PAGE_SIZE = 1_000;
const CHECK_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const TABLES = [
  "check_request_templates",
  "check_models",
  "check_configs",
  "check_history",
  "group_info",
  "system_notifications",
] as const;

export interface SupabaseQueryLike {
  gte(column: string, value: string): SupabaseQueryLike;
  order(column: string, options?: { ascending?: boolean }): SupabaseQueryLike;
  range(
    from: number,
    to: number
  ): PromiseLike<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
}

export interface SupabaseSelectLike {
  select(columns: string): SupabaseQueryLike;
}

export interface SupabaseLike {
  from(table: string): SupabaseSelectLike;
}

interface ExportTableOptions {
  nowMs?: number;
  pageSize?: number;
}

export async function exportTable(
  outputDir: string,
  table: (typeof TABLES)[number],
  client: SupabaseLike,
  options: ExportTableOptions = {}
) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const rows: Array<Record<string, unknown>> = [];
  let offset = 0;

  for (;;) {
    let query = client.from(table).select("*");
    if (table === "check_history") {
      query = query.gte(
        "checked_at",
        new Date((options.nowMs ?? Date.now()) - CHECK_HISTORY_RETENTION_MS).toISOString()
      );
    }
    query = query.order(table === "check_history" ? "checked_at" : "id", {
      ascending: true,
    });

    const { data, error } = await query.range(offset, offset + pageSize - 1);

    if (error) {
      throw error;
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  const jsonl = rows.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(join(outputDir, `${table}.jsonl`), `${jsonl}\n`);
}

export async function exportSupabase(outputDir: string) {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  await mkdir(outputDir, { recursive: true });
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  for (const table of TABLES) {
    await exportTable(outputDir, table, client);
  }
}

export async function runSupabaseExportCli(argv = process.argv): Promise<void> {
  const outputDir = argv[2];
  if (!outputDir) {
    throw new Error("Usage: tsx export-supabase.ts <output-dir>");
  }

  await exportSupabase(outputDir);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSupabaseExportCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
