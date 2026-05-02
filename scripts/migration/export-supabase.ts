import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

const TABLES = [
  "check_request_templates",
  "check_models",
  "check_configs",
  "check_history",
  "group_info",
  "system_notifications",
] as const;

async function exportTable(
  outputDir: string,
  table: (typeof TABLES)[number],
  url: string,
  serviceRoleKey: string
) {
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const query =
    table === "check_history"
      ? client
          .from(table)
          .select("*")
          .gte("checked_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      : client.from(table).select("*");
  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const jsonl = (data ?? []).map((row) => JSON.stringify(row)).join("\n");
  await writeFile(join(outputDir, `${table}.jsonl`), `${jsonl}\n`);
}

export async function exportSupabase(outputDir: string) {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  await mkdir(outputDir, { recursive: true });
  for (const table of TABLES) {
    await exportTable(outputDir, table, url, serviceRoleKey);
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
