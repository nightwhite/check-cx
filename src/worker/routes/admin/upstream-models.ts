import { Hono } from "hono";

import { decryptProviderKey } from "../../crypto/provider-key";
import {
  createAdminChannelRepository,
  createAdminConfigRepository,
  createAdminModelRepository,
} from "../../db/repositories/admin";
import {
  fetchUpstreamModels,
  UpstreamModelsError,
  type UpstreamFetch,
} from "../../providers/upstream-models";
import { getEncryptionKey, nowMs, routeError } from "./helpers";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
  apiFormat,
  optionalBoolean,
  optionalString,
  providerType,
  readJsonObject,
} from "./validation";

const MAX_IMPORT_MODELS = 100;

class UpstreamRouteError extends AdminConflictError {}

async function loadChannelCredentials(env: Env, channelId: string) {
  const row = await createAdminChannelRepository(env.DB).findSecret(channelId);
  if (!row) {
    throw new AdminNotFoundError("渠道不存在");
  }
  if (!row.base_url) {
    throw new AdminConflictError("渠道未配置 Base URL，无法获取上游模型");
  }
  if (!row.api_key_ciphertext || !row.api_key_nonce) {
    throw new AdminConflictError("渠道未配置 API Key，无法获取上游模型");
  }
  const encryptionKey = getEncryptionKey(env);
  const apiKey = await decryptProviderKey(
    {
      ciphertext: row.api_key_ciphertext,
      nonce: row.api_key_nonce,
      version: row.api_key_version ?? 1,
    },
    encryptionKey
  ).catch(() => {
    throw new AdminConflictError("渠道 API Key 解密失败，请重新保存渠道 Key");
  });
  return { baseUrl: row.base_url, apiKey };
}

interface ImportItem {
  model: string;
  type: ReturnType<typeof providerType>;
  apiFormat: ReturnType<typeof apiFormat>;
}

function parseImportItems(body: Record<string, unknown>): ImportItem[] {
  const raw = body.models;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AdminValidationError("请至少选择一个模型");
  }
  if (raw.length > MAX_IMPORT_MODELS) {
    throw new AdminValidationError(`一次最多导入 ${MAX_IMPORT_MODELS} 个模型`);
  }
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new AdminValidationError("模型条目格式不正确");
    }
    const item = entry as Record<string, unknown>;
    const model = optionalString(item, "model");
    if (!model) {
      throw new AdminValidationError("模型名不能为空");
    }
    return {
      model,
      type: providerType(optionalString(item, "type") ?? "openai"),
      apiFormat: apiFormat(optionalString(item, "apiFormat") ?? "chat_completions"),
    };
  });
}

export function createUpstreamModelRoutes(fetcher?: UpstreamFetch) {
  return new Hono<{ Bindings: Env }>()
    .get("/:id/upstream-models", async (c) => {
      try {
        const channelId = c.req.param("id");
        const { baseUrl, apiKey } = await loadChannelCredentials(c.env, channelId);
        const upstream = await fetchUpstreamModels(baseUrl, apiKey, fetcher).catch(
          (error) => {
            if (error instanceof UpstreamModelsError) {
              throw new UpstreamRouteError(error.message);
            }
            throw error;
          }
        );

        // 标记已存在的模型与已在该渠道监控的模型，前端据此默认勾选
        const models = createAdminModelRepository(c.env.DB);
        const configs = createAdminConfigRepository(c.env.DB);
        const result = [];
        for (const item of upstream) {
          const existing = await models.findByTypeAndName(item.type, item.id);
          result.push({
            ...item,
            modelExists: Boolean(existing),
            monitored: existing
              ? await configs.existsForChannelModel(channelId, existing.id)
              : false,
          });
        }
        return c.json({ models: result });
      } catch (error) {
        return routeError(c, error);
      }
    })
    .post("/:id/import-models", async (c) => {
      try {
        const channelId = c.req.param("id");
        const body = await readJsonObject(c.req.raw);
        const items = parseImportItems(body);
        const createConfigs = optionalBoolean(body, "createConfigs", true);
        const channel = await createAdminChannelRepository(c.env.DB).findCredentials(
          channelId
        );
        if (!channel) {
          throw new AdminNotFoundError("渠道不存在");
        }
        if (createConfigs && (!channel.baseUrl || !channel.hasApiKey)) {
          throw new AdminConflictError(
            "渠道需同时配置 Base URL 与 API Key 才能批量创建监控项"
          );
        }

        const models = createAdminModelRepository(c.env.DB);
        const configs = createAdminConfigRepository(c.env.DB);
        const now = nowMs();
        const summary = {
          modelsCreated: 0,
          modelsReused: 0,
          configsCreated: 0,
          configsSkipped: 0,
        };

        for (const item of items) {
          const existing = await models.findByTypeAndName(item.type, item.model);
          let modelId = existing?.id;
          if (modelId) {
            summary.modelsReused += 1;
          } else {
            modelId = crypto.randomUUID();
            await models.create({
              id: modelId,
              type: item.type,
              model: item.model,
              templateId: null,
              nowMs: now,
            });
            summary.modelsCreated += 1;
          }

          if (!createConfigs) {
            continue;
          }
          if (await configs.existsForChannelModel(channelId, modelId)) {
            summary.configsSkipped += 1;
            continue;
          }
          await configs.create({
            id: crypto.randomUUID(),
            name: item.model,
            type: item.type,
            modelId,
            channelId,
            endpoint: "",
            hostHeader: null,
            apiFormat: item.apiFormat,
            encryptedKey: null,
            enabled: true,
            isMaintenance: false,
            groupName: null,
            checkIntervalSeconds: null,
            region: null,
            nowMs: now,
          });
          summary.configsCreated += 1;
        }

        return c.json(summary, 201);
      } catch (error) {
        return routeError(c, error);
      }
    });
}
