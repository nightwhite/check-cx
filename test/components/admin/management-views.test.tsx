// @vitest-environment jsdom

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
          apiKey: "sk-live-secret",
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
    expect(screen.getByText("OpenAI Official")).not.toBeNull();
    expect(screen.getByText("30 秒")).not.toBeNull();
    expect(screen.getByText("global")).not.toBeNull();
    expect(screen.getByText("已配置")).not.toBeNull();
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
