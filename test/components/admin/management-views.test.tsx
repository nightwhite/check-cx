// @vitest-environment jsdom

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { AdminShell } from "../../../src/components/admin/admin-shell";
import type {
  AdminSummary,
  AdminView,
} from "../../../src/components/admin/admin-types";

const summary: AdminSummary = {
  modelCount: 1,
  configCount: 2,
  enabledConfigCount: 1,
  maintenanceConfigCount: 1,
  templateCount: 1,
  groupCount: 1,
  activeNotificationCount: 1,
  recentErrorCount: 0,
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setupFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    void _init;
    const path = String(input);
    if (path === "/api/admin/configs") {
      return jsonResponse([
        {
          id: "config-openai",
          name: "OpenAI primary",
          type: "openai",
          modelId: "model-openai",
          model: "gpt-4o",
          templateId: "template-openai",
          templateName: "OpenAI template",
          channelId: "channel-openai",
          channelName: "OpenAI Official",
          channelLogoUrl: null,
          endpoint: "https://api.openai.com/v1/chat/completions",
          enabled: true,
          isMaintenance: false,
          groupName: null,
          checkIntervalSeconds: 30,
          region: "global",
          hasApiKey: true,
          inheritsEndpoint: false,
          keySource: "config",
          effectiveEndpoint: "https://api.openai.com/v1/chat/completions",
          apiKey: "sk-live-secret",
          createdAtMs: 1_700_000_000_000,
          updatedAtMs: 1_700_000_000_000,
        },
        {
          id: "config-inherited",
          name: "Relay responses",
          type: "openai",
          modelId: "model-openai",
          model: "gpt-4o",
          templateId: null,
          templateName: null,
          channelId: "channel-openai",
          channelName: "OpenAI Official",
          channelLogoUrl: null,
          endpoint: "",
          apiFormat: "responses",
          enabled: true,
          isMaintenance: false,
          groupName: null,
          checkIntervalSeconds: null,
          region: null,
          hasApiKey: false,
          inheritsEndpoint: true,
          keySource: "channel",
          effectiveEndpoint: "https://relay.example.com/v1/responses",
          createdAtMs: 1_700_000_000_000,
          updatedAtMs: 1_700_000_000_000,
        },
        {
          id: "config-empty-key",
          name: "Gemini standby",
          type: "gemini",
          modelId: "model-gemini",
          model: "gemini-2.0-flash",
          templateId: null,
          templateName: null,
          channelId: "channel-google",
          channelName: "Google AI Studio",
          channelLogoUrl: null,
          endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
          enabled: false,
          isMaintenance: true,
          groupName: null,
          checkIntervalSeconds: null,
          region: null,
          hasApiKey: false,
          inheritsEndpoint: false,
          keySource: "none",
          effectiveEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
          createdAtMs: 1_700_000_000_000,
          updatedAtMs: 1_700_000_000_000,
        },
      ]);
    }
    if (path === "/api/admin/models") {
      return jsonResponse([
        {
          id: "model-openai",
          type: "openai",
          model: "gpt-4o",
          templateId: "template-openai",
          templateName: "OpenAI template",
          createdAtMs: 1_700_000_000_000,
          updatedAtMs: 1_700_000_000_000,
        },
      ]);
    }
    if (path === "/api/admin/templates") {
      return jsonResponse([
        {
          id: "template-openai",
          name: "OpenAI template",
          type: "openai",
          requestHeader: { "x-check": "1" },
          metadata: null,
          createdAtMs: 1_700_000_000_000,
          updatedAtMs: 1_700_000_000_000,
        },
      ]);
    }
    if (path === "/api/admin/groups") {
      return jsonResponse([
        {
          id: "group-core",
          groupName: "core",
          websiteUrl: "https://status.example.com",
          tags: "prod,ai",
          createdAtMs: 1_700_000_000_000,
          updatedAtMs: 1_700_000_000_000,
        },
      ]);
    }
    if (path === "/api/admin/channels") {
      return jsonResponse([
        {
          id: "channel-openai",
          name: "OpenAI Official",
          logoUrl: null,
          websiteUrl: "https://openai.com/",
          statusPageUrl: "https://status.openai.com/",
          baseUrl: "https://relay.example.com",
          hasApiKey: true,
          sortOrder: 10,
          enabled: true,
          createdAtMs: 1_700_000_000_000,
          updatedAtMs: 1_700_000_000_000,
        },
      ]);
    }
    if (path === "/api/admin/notifications") {
      return jsonResponse([
        {
          id: "notification-1",
          message: "OpenAI maintenance",
          level: "warning",
          isActive: true,
          createdAtMs: 1_700_000_000_000,
        },
      ]);
    }
    if (path === "/api/admin/runtime") {
      return jsonResponse({
        cron: {
          expression: "*/1 * * * *",
          label: "每 1 分钟",
        },
        recentRuns: [
          {
            id: "run-1",
            jobName: "health-check",
            ownerId: "worker-1",
            status: "success",
            startedAtMs: 1_700_000_000_000,
            finishedAtMs: 1_700_000_003_000,
            checkedCount: 2,
            errorMessage: null,
          },
        ],
        locks: [],
        snapshots: [
          {
            snapshotKey: "dashboard",
            period: "7d",
            generatedAtMs: 1_700_000_003_000,
          },
        ],
        latestCheck: {
          checkedAtMs: 1_700_000_003_000,
          updatedAtMs: 1_700_000_003_000,
        },
      });
    }
    return jsonResponse({ error: "unexpected request" }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setupEmptyFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (
      path === "/api/admin/configs" ||
      path === "/api/admin/models" ||
      path === "/api/admin/templates" ||
      path === "/api/admin/groups" ||
      path === "/api/admin/channels" ||
      path === "/api/admin/notifications"
    ) {
      return jsonResponse([]);
    }
    return jsonResponse({ error: "unexpected request" }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderShell(initialView: AdminView) {
  function Wrapper() {
    const [activeView, setActiveView] = React.useState<AdminView>(initialView);
    return (
      <AdminShell
        activeView={activeView}
        summary={summary}
        onViewChange={setActiveView}
      />
    );
  }

  render(<Wrapper />);
}

describe("admin management views", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders config key status without exposing key material or batch controls", async () => {
    setupFetch();

    renderShell("configs");

    expect(await screen.findByText("OpenAI primary")).not.toBeNull();
    expect(screen.getAllByText("OpenAI Official").length).toBeGreaterThan(0);
    expect(screen.getByText("30 秒")).not.toBeNull();
    expect(screen.getByText("global")).not.toBeNull();
    expect(screen.getByText("独立 Key")).not.toBeNull();
    expect(screen.getByText("继承渠道")).not.toBeNull();
    expect(screen.getByText("继承 · relay.example.com")).not.toBeNull();
    expect(screen.getAllByText("未配置").length).toBeGreaterThan(0);
    expect(screen.queryByText(/sk-live-secret/)).toBeNull();
    expect(screen.queryByText(/批量/)).toBeNull();
  });

  it("opens secret replacement with an empty key field", async () => {
    setupFetch();

    renderShell("configs");

    await screen.findByText("OpenAI primary");
    fireEvent.click(screen.getAllByRole("button", { name: "替换 Key" })[0]);

    expect(
      screen.getByRole("dialog", { name: "替换 API Key" })
    ).not.toBeNull();
    expect(screen.queryByText(/sk-live-secret/)).toBeNull();
    expect(screen.getByLabelText("新 API Key")).toHaveProperty("value", "");
  });

  it("lets configs with their own key switch back to the channel key", async () => {
    const fetchMock = setupFetch();

    renderShell("configs");

    await screen.findByText("OpenAI primary");
    fireEvent.click(screen.getAllByRole("button", { name: "替换 Key" })[0]);
    const inheritButton = await screen.findByRole("button", {
      name: "改为继承渠道 Key",
    });
    fetchMock.mockImplementationOnce(async () => jsonResponse({ ok: true, hasApiKey: false }));
    fireEvent.click(inheritButton);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "替换 API Key" })).toBeNull()
    );
    expect(screen.getAllByText("继承渠道")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/configs/config-openai/secret",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("previews the inherited endpoint and fills the name from the model", async () => {
    const fetchMock = setupFetch();

    renderShell("configs");

    fireEvent.click(await screen.findByRole("button", { name: "新增监控项" }));
    const dialog = screen.getByRole("dialog", { name: "新增监控项" });
    const selects = dialog.querySelectorAll("select");
    fireEvent.change(selects[0], { target: { value: "channel-openai" } });
    fireEvent.change(selects[2], { target: { value: "model-openai" } });
    fireEvent.change(selects[3], { target: { value: "responses" } });

    expect(
      screen.getByText("将请求：https://relay.example.com/v1/responses")
    ).not.toBeNull();

    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ id: "config-new", name: "gpt-4o" }, 201)
    );
    fireEvent.click(screen.getByRole("button", { name: "保存监控项" }));

    const createCall = fetchMock.mock.calls.find(
      ([path, init]) =>
        path === "/api/admin/configs" && init?.method === "POST"
    );
    expect(createCall).toBeDefined();
    const body = JSON.parse(String(createCall?.[1]?.body));
    expect(body).toMatchObject({
      name: "gpt-4o",
      channelId: "channel-openai",
      endpoint: "",
      apiFormat: "responses",
    });
    expect(body).not.toHaveProperty("apiKey");
  });

  it("shows channel API base host and key status", async () => {
    setupFetch();

    renderShell("channels");

    expect(await screen.findByText("relay.example.com")).not.toBeNull();
    expect(screen.getByText("Key 已配置")).not.toBeNull();
  });

  it("imports upstream models from a channel and creates monitor configs", async () => {
    const fetchMock = setupFetch();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/admin/channels/channel-openai/upstream-models") {
        return jsonResponse({
          models: [
            { id: "claude-opus-5-5", type: "anthropic", ownedBy: null, modelExists: false, monitored: false },
            { id: "gpt-4o", type: "openai", ownedBy: null, modelExists: true, monitored: true },
            { id: "gpt-6", type: "openai", ownedBy: null, modelExists: false, monitored: false },
          ],
        });
      }
      if (path === "/api/admin/channels/channel-openai/import-models") {
        expect(init?.method).toBe("POST");
        return jsonResponse(
          { modelsCreated: 2, modelsReused: 0, configsCreated: 2, configsSkipped: 0 },
          201
        );
      }
      if (path === "/api/admin/channels") {
        return jsonResponse([
          {
            id: "channel-openai",
            name: "OpenAI Official",
            logoUrl: null,
            websiteUrl: null,
            statusPageUrl: null,
            baseUrl: "https://relay.example.com",
            hasApiKey: true,
            sortOrder: 0,
            enabled: true,
            createdAtMs: 1,
            updatedAtMs: 1,
          },
        ]);
      }
      return jsonResponse([]);
    });

    renderShell("channels");

    fireEvent.click(await screen.findByRole("button", { name: "获取模型" }));
    const dialog = await screen.findByRole("dialog", { name: "获取上游模型" });
    await screen.findByText("gpt-6");

    expect(
      (screen.getByLabelText("选择 gpt-4o") as HTMLInputElement).disabled
    ).toBe(true);
    expect(screen.getByText("已监控")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("筛选上游模型"), {
      target: { value: "gpt" },
    });
    expect(screen.queryByText("claude-opus-5-5")).toBeNull();
    fireEvent.change(screen.getByLabelText("筛选上游模型"), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: "全选 2" }));
    expect(dialog.textContent).toContain("已选 2 个");
    fireEvent.click(screen.getByRole("button", { name: "导入并创建监控项" }));

    await screen.findByText("新增模型 2 个，新增监控项 2 个");
    const importCall = fetchMock.mock.calls.find(
      ([path]) => path === "/api/admin/channels/channel-openai/import-models"
    );
    expect(JSON.parse(String(importCall?.[1]?.body))).toEqual({
      createConfigs: true,
      models: [
        { model: "claude-opus-5-5", type: "anthropic", apiFormat: "chat_completions" },
        { model: "gpt-6", type: "openai", apiFormat: "chat_completions" },
      ],
    });
  });

  it("disables model import for channels without credentials", async () => {
    const fetchMock = setupFetch();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input) === "/api/admin/channels"
        ? jsonResponse([
            {
              id: "channel-bare",
              name: "Bare",
              logoUrl: null,
              websiteUrl: null,
              statusPageUrl: null,
              baseUrl: null,
              hasApiKey: false,
              sortOrder: 0,
              enabled: true,
              createdAtMs: 1,
              updatedAtMs: 1,
            },
          ])
        : jsonResponse([])
    );

    renderShell("channels");

    const button = await screen.findByRole("button", { name: "获取模型" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders the runtime cron cadence as read-only", async () => {
    setupFetch();

    renderShell("runtime");

    expect(await screen.findByText("每 1 分钟")).not.toBeNull();
    expect(screen.getByText("*/1 * * * *")).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: /Cron/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /保存 Cron|修改 Cron/ })).toBeNull();
  });

  it("renders an empty table state with the create action", async () => {
    setupEmptyFetch();

    renderShell("models");

    expect(await screen.findByText("还没有模型")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "新增模型" }).length).toBeGreaterThan(0);
  });

  it("requires a channel when creating monitor configs", async () => {
    setupFetch();

    renderShell("configs");

    fireEvent.click(await screen.findByRole("button", { name: "新增监控项" }));
    fireEvent.click(screen.getByRole("button", { name: "保存监控项" }));

    expect(screen.getByText("渠道必选")).not.toBeNull();
  });

  it("shows form validation errors before saving invalid data", async () => {
    setupEmptyFetch();

    renderShell("templates");

    fireEvent.click(await screen.findByRole("button", { name: "新增模板" }));
    fireEvent.click(screen.getByRole("button", { name: "保存模板" }));

    expect(screen.getByText("模板名称必填")).not.toBeNull();
  });
});
