import { describe, expect, it } from "vitest";

import { encryptProviderKey } from "../../../scripts/migration/encrypt-provider-keys";
import { loadEnabledProviderConfigs } from "../../../src/worker/db/repositories/provider-configs";
import {
  createMigratedDatabase,
  type DatabaseLike,
  type StatementSyncLike,
} from "./sqljs-test-helper";

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
}

class D1SqliteAdapter {
  constructor(private readonly db: DatabaseLike) {}

  prepare(query: string) {
    return new D1StatementForSqlite(this.db.prepare(query));
  }
}

describe("provider config repository", () => {
  it("loads enabled D1 configs with decrypted keys and template options", async () => {
    const db = await createMigratedDatabase();
    const encryptionKey = "0123456789abcdef0123456789abcdef";
    const encrypted = await encryptProviderKey("sk-test", encryptionKey);

    db.prepare(
      "INSERT INTO check_request_templates (id, name, type, request_header_json, metadata_json, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "template-1",
      "OpenAI chat completions",
      "openai",
      JSON.stringify({ "x-custom-header": "1" }),
      JSON.stringify({ temperature: 0 }),
      1,
      1
    );
    db.prepare(
      "INSERT INTO check_models (id, type, model, template_id, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("model-1", "openai", "gpt-4o-mini", "template-1", 1, 1);
    db.prepare(
      "INSERT INTO channels (id, name, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?)"
    ).run("channel-1", "OpenAI Official", 1, 1);
    db.prepare(
      "INSERT INTO check_configs (id, name, type, model_id, endpoint, api_key_ciphertext, api_key_nonce, api_key_version, enabled, is_maintenance, group_name, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "config-1",
      "OpenAI primary",
      "openai",
      "model-1",
      "https://api.openai.com/v1/chat/completions",
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.version,
      1,
      0,
      "core",
      1,
      1
    );

    await expect(
      loadEnabledProviderConfigs(new D1SqliteAdapter(db), encryptionKey)
    ).resolves.toEqual([
      {
        id: "config-1",
        name: "OpenAI primary",
        type: "openai",
        endpoint: "https://api.openai.com/v1/chat/completions",
        apiFormat: "chat_completions",
        model: "gpt-4o-mini",
        apiKey: "sk-test",
        isMaintenance: false,
        requestHeaders: { "x-custom-header": "1" },
        metadata: { temperature: 0 },
        groupName: "core",
        channelId: null,
        channelName: null,
        channelLogoUrl: null,
        checkIntervalSeconds: null,
        effectiveCheckIntervalSeconds: 60,
        lastCheckedAtMs: null,
        region: null,
      },
    ]);
  });

  it("keeps maintenance configs loadable without an encrypted key", async () => {
    const db = await createMigratedDatabase();

    db.prepare(
      "INSERT INTO check_models (id, type, model, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)"
    ).run("model-1", "anthropic", "claude-3-5-haiku-latest", 1, 1);
    db.prepare(
      "INSERT INTO check_configs (id, name, type, model_id, endpoint, enabled, is_maintenance, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "config-maintenance",
      "Anthropic maintenance",
      "anthropic",
      "model-1",
      "https://api.anthropic.com/v1/messages",
      1,
      1,
      1,
      1
    );

    const configs = await loadEnabledProviderConfigs(
      new D1SqliteAdapter(db),
      "0123456789abcdef0123456789abcdef"
    );

    expect(configs).toEqual([
      expect.objectContaining({
        id: "config-maintenance",
        apiKey: "",
        isMaintenance: true,
      }),
    ]);
  });

  it("loads only configs whose effective interval is due", async () => {
    const db = await createMigratedDatabase();
    const encryptionKey = "0123456789abcdef0123456789abcdef";
    const encrypted = await encryptProviderKey("sk-test", encryptionKey);

    db.prepare(
      "UPDATE site_settings SET default_check_interval_seconds = ? WHERE id = 'default'"
    ).run(60);
    db.prepare(
      "INSERT INTO channels (id, name, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?)"
    ).run("channel-1", "OpenAI Official", 1, 1);
    db.prepare(
      "INSERT INTO check_models (id, type, model, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)"
    ).run("model-1", "openai", "gpt-4o-mini", 1, 1);
    db.prepare(
      `INSERT INTO check_configs (
         id, name, type, model_id, channel_id, endpoint,
         api_key_ciphertext, api_key_nonce, api_key_version,
         enabled, is_maintenance, check_interval_seconds,
         last_checked_at_ms, region, created_at_ms, updated_at_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "due-override",
      "Due override",
      "openai",
      "model-1",
      "channel-1",
      "https://api.openai.com/v1/chat/completions",
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.version,
      1,
      0,
      30,
      1_000,
      "global",
      1,
      1
    );
    db.prepare(
      `INSERT INTO check_configs (
         id, name, type, model_id, channel_id, endpoint,
         api_key_ciphertext, api_key_nonce, api_key_version,
         enabled, is_maintenance, check_interval_seconds,
         last_checked_at_ms, created_at_ms, updated_at_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "not-due-default",
      "Not due default",
      "openai",
      "model-1",
      "channel-1",
      "https://api.openai.com/v1/chat/completions",
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.version,
      1,
      0,
      null,
      70_000,
      1,
      1
    );
    db.prepare(
      `INSERT INTO check_configs (
         id, name, type, model_id, channel_id, endpoint,
         api_key_ciphertext, api_key_nonce, api_key_version,
         enabled, is_maintenance, check_interval_seconds,
         last_checked_at_ms, created_at_ms, updated_at_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "due-default",
      "Due default",
      "openai",
      "model-1",
      "channel-1",
      "https://api.openai.com/v1/chat/completions",
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.version,
      1,
      0,
      null,
      1_000,
      1,
      1
    );

    const configs = await loadEnabledProviderConfigs(
      new D1SqliteAdapter(db),
      encryptionKey,
      90_000
    );

    expect(configs.map((config) => config.id)).toEqual([
      "due-default",
      "due-override",
    ]);
    expect(configs).toEqual([
      expect.objectContaining({
        id: "due-default",
        effectiveCheckIntervalSeconds: 60,
        lastCheckedAtMs: 1_000,
      }),
      expect.objectContaining({
        id: "due-override",
        channelId: "channel-1",
        channelName: "OpenAI Official",
        checkIntervalSeconds: 30,
        effectiveCheckIntervalSeconds: 30,
        lastCheckedAtMs: 1_000,
        region: "global",
      }),
    ]);
  });
});
