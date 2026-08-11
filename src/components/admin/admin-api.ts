import type {
  AdminConfigRecord,
  AdminChannelRecord,
  AdminGroupRecord,
  AdminModelRecord,
  AdminNotificationRecord,
  AdminNotificationSettingsRecord,
  AdminRuntimeStatus,
  AdminSessionResponse,
  AdminSiteSettingsRecord,
  AdminSummary,
  AdminTemplateRecord,
} from "./admin-types";

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function requestJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let message = "请求失败";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      message = "请求失败";
    }
    throw new Error(message);
  }
  return parseJson<T>(response);
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function getAdminSession(): Promise<AdminSessionResponse> {
  const response = await fetch("/api/admin/session");
  if (response.status === 503) {
    return { error: "admin_unavailable" };
  }
  if (!response.ok) {
    return { authenticated: false };
  }
  return parseJson<AdminSessionResponse>(response);
}

export async function loginAdmin(token: string): Promise<AdminSessionResponse> {
  const response = await fetch("/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (response.status === 503) {
    return { error: "admin_unavailable" };
  }
  if (response.status === 401) {
    return { error: "unauthorized" };
  }
  return parseJson<AdminSessionResponse>(response);
}

export async function getAdminSummary(): Promise<AdminSummary | null> {
  const response = await fetch("/api/admin/summary");
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("summary request failed");
  }
  return parseJson<AdminSummary>(response);
}

export async function listAdminConfigs(): Promise<AdminConfigRecord[]> {
  return requestJson<AdminConfigRecord[]>("/api/admin/configs");
}

export async function listAdminChannels(): Promise<AdminChannelRecord[]> {
  return requestJson<AdminChannelRecord[]>("/api/admin/channels");
}

export async function createAdminChannel(
  payload: Record<string, unknown>
): Promise<AdminChannelRecord> {
  return requestJson<AdminChannelRecord>(
    "/api/admin/channels",
    jsonInit("POST", payload)
  );
}

export async function updateAdminChannel(
  id: string,
  payload: Record<string, unknown>
): Promise<AdminChannelRecord> {
  return requestJson<AdminChannelRecord>(
    `/api/admin/channels/${id}`,
    jsonInit("PUT", payload)
  );
}

export async function deleteAdminChannel(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/admin/channels/${id}`, {
    method: "DELETE",
  });
}

export async function createAdminConfig(
  payload: Record<string, unknown>
): Promise<AdminConfigRecord> {
  return requestJson<AdminConfigRecord>(
    "/api/admin/configs",
    jsonInit("POST", payload)
  );
}

export async function updateAdminConfig(
  id: string,
  payload: Record<string, unknown>
): Promise<AdminConfigRecord> {
  return requestJson<AdminConfigRecord>(
    `/api/admin/configs/${id}`,
    jsonInit("PATCH", payload)
  );
}

export async function deleteAdminConfig(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/admin/configs/${id}`, {
    method: "DELETE",
  });
}

export async function replaceAdminConfigSecret(
  id: string,
  apiKey: string
): Promise<void> {
  await requestJson<{ ok: boolean; hasApiKey: boolean }>(
    `/api/admin/configs/${id}/secret`,
    jsonInit("POST", { apiKey })
  );
}

export async function listAdminModels(): Promise<AdminModelRecord[]> {
  return requestJson<AdminModelRecord[]>("/api/admin/models");
}

export async function createAdminModel(
  payload: Record<string, unknown>
): Promise<AdminModelRecord> {
  return requestJson<AdminModelRecord>(
    "/api/admin/models",
    jsonInit("POST", payload)
  );
}

export async function updateAdminModel(
  id: string,
  payload: Record<string, unknown>
): Promise<AdminModelRecord> {
  return requestJson<AdminModelRecord>(
    `/api/admin/models/${id}`,
    jsonInit("PATCH", payload)
  );
}

export async function deleteAdminModel(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/admin/models/${id}`, {
    method: "DELETE",
  });
}

export async function listAdminTemplates(): Promise<AdminTemplateRecord[]> {
  return requestJson<AdminTemplateRecord[]>("/api/admin/templates");
}

export async function createAdminTemplate(
  payload: Record<string, unknown>
): Promise<AdminTemplateRecord> {
  return requestJson<AdminTemplateRecord>(
    "/api/admin/templates",
    jsonInit("POST", payload)
  );
}

export async function updateAdminTemplate(
  id: string,
  payload: Record<string, unknown>
): Promise<AdminTemplateRecord> {
  return requestJson<AdminTemplateRecord>(
    `/api/admin/templates/${id}`,
    jsonInit("PATCH", payload)
  );
}

export async function deleteAdminTemplate(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/admin/templates/${id}`, {
    method: "DELETE",
  });
}

export async function listAdminGroups(): Promise<AdminGroupRecord[]> {
  return requestJson<AdminGroupRecord[]>("/api/admin/groups");
}

export async function createAdminGroup(
  payload: Record<string, unknown>
): Promise<AdminGroupRecord> {
  return requestJson<AdminGroupRecord>(
    "/api/admin/groups",
    jsonInit("POST", payload)
  );
}

export async function updateAdminGroup(
  id: string,
  payload: Record<string, unknown>
): Promise<AdminGroupRecord> {
  return requestJson<AdminGroupRecord>(
    `/api/admin/groups/${id}`,
    jsonInit("PATCH", payload)
  );
}

export async function deleteAdminGroup(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/admin/groups/${id}`, {
    method: "DELETE",
  });
}

export async function listAdminNotifications(): Promise<
  AdminNotificationRecord[]
> {
  return requestJson<AdminNotificationRecord[]>("/api/admin/notifications");
}

export async function getAdminNotificationSettings(): Promise<AdminNotificationSettingsRecord> {
  return requestJson<AdminNotificationSettingsRecord>(
    "/api/admin/notification-settings"
  );
}

export async function updateAdminNotificationSettings(
  payload: Record<string, unknown>
): Promise<AdminNotificationSettingsRecord> {
  return requestJson<AdminNotificationSettingsRecord>(
    "/api/admin/notification-settings",
    jsonInit("PUT", payload)
  );
}

export async function createAdminNotification(
  payload: Record<string, unknown>
): Promise<AdminNotificationRecord> {
  return requestJson<AdminNotificationRecord>(
    "/api/admin/notifications",
    jsonInit("POST", payload)
  );
}

export async function updateAdminNotification(
  id: string,
  payload: Record<string, unknown>
): Promise<AdminNotificationRecord> {
  return requestJson<AdminNotificationRecord>(
    `/api/admin/notifications/${id}`,
    jsonInit("PATCH", payload)
  );
}

export async function deleteAdminNotification(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/admin/notifications/${id}`, {
    method: "DELETE",
  });
}

export async function getAdminRuntime(): Promise<AdminRuntimeStatus> {
  return requestJson<AdminRuntimeStatus>("/api/admin/runtime");
}

export async function getAdminSiteSettings(): Promise<AdminSiteSettingsRecord> {
  return requestJson<AdminSiteSettingsRecord>("/api/admin/site-settings");
}

export async function updateAdminSiteSettings(
  payload: Record<string, unknown>
): Promise<AdminSiteSettingsRecord> {
  return requestJson<AdminSiteSettingsRecord>(
    "/api/admin/site-settings",
    jsonInit("PUT", payload)
  );
}
