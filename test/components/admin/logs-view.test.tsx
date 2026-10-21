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
import type { AdminSummary } from "../../../src/components/admin/admin-types";

const summary: AdminSummary = {
  modelCount: 0,
  configCount: 0,
  enabledConfigCount: 0,
  maintenanceConfigCount: 0,
  templateCount: 0,
  groupCount: 0,
  activeNotificationCount: 0,
  recentErrorCount: 0,
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const logs = [
  {
    id: "log-2",
    configId: "cfg-1",
    name: "Azure primary",
    type: "openai",
    channelId: "ch-azure",
    channelName: "Azure",
    model: "gpt-5.4-mini",
    status: "operational",
    latencyMs: 1643,
    pingLatencyMs: 500,
    checkedAtMs: 1_700_000_060_000,
    message: "OK",
    logMessage: "Hi! How can I help?",
  },
  {
    id: "log-1",
    configId: "cfg-1",
    name: "Azure mini",
    type: "openai",
    channelId: "ch-azure",
    channelName: "Azure",
    model: "gpt-5.4-mini",
    status: "failed",
    latencyMs: 743,
    pingLatencyMs: 500,
    checkedAtMs: 1_700_000_000_000,
    message: "Provider returned HTTP 521",
    logMessage: '{"error":{"code":"upstream_unavailable"}}',
  },
];

describe("logs view", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders recent logs and supports status and keyword filters", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/admin/channels") {
        return jsonResponse([
          {
            id: "ch-azure",
            name: "Azure",
            logoUrl: null,
            websiteUrl: null,
            statusPageUrl: null,
            baseUrl: null,
            hasApiKey: false,
            sortOrder: 1,
            enabled: true,
            createdAtMs: 1,
            updatedAtMs: 1,
          },
        ]);
      }
      if (path.startsWith("/api/admin/logs")) {
        return jsonResponse({ total: logs.length, limit: 100, offset: 0, logs });
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminShell
        activeView="logs"
        summary={summary}
        onViewChange={() => {}}
      />
    );

    expect(await screen.findByText("Azure primary")).not.toBeNull();
    expect(screen.getByText("Provider returned HTTP 521")).not.toBeNull();
    expect(
      screen.getByText('{"error":{"code":"upstream_unavailable"}}')
    ).not.toBeNull();

    fireEvent.change(screen.getByLabelText("状态筛选"), {
      target: { value: "failed" },
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("status=failed")
        )
      ).toBe(true);
    });

    fireEvent.change(
      screen.getByPlaceholderText("搜索监控项、模型或日志内容"),
      { target: { value: "521" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "查询" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes("q=521"))
      ).toBe(true);
    });
  });
});
