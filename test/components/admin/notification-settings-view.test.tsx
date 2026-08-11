// @vitest-environment jsdom

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

describe("notification settings view", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads and saves Feishu webhook settings without showing plaintext", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/admin/notification-settings" && !init?.method) {
        return jsonResponse({
          id: "default",
          enabled: false,
          hasWebhookUrl: false,
          notifyDegraded: true,
          notifyFailed: true,
          notifyRecovered: true,
          createdAtMs: 1,
          updatedAtMs: 1,
        });
      }
      if (path === "/api/admin/notification-settings" && init?.method === "PUT") {
        return jsonResponse({
          id: "default",
          enabled: true,
          hasWebhookUrl: true,
          notifyDegraded: true,
          notifyFailed: true,
          notifyRecovered: true,
          createdAtMs: 1,
          updatedAtMs: 2,
        });
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminShell
        activeView="notification-settings"
        summary={summary}
        onViewChange={() => {}}
      />
    );

    const webhook = await screen.findByLabelText("飞书 Webhook URL");
    fireEvent.change(webhook, {
      target: {
        value: "https://open.feishu.cn/open-apis/bot/v2/hook/test-secret",
      },
    });
    fireEvent.click(screen.getByLabelText("启用通知"));
    fireEvent.click(screen.getByRole("button", { name: "保存通知设置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/notification-settings",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("test-secret"),
        })
      );
    });
    expect(await screen.findByText("通知设置已保存")).not.toBeNull();
    expect(screen.queryByText("test-secret")).toBeNull();
  });
});
