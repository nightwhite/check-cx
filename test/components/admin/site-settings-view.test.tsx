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

describe("site settings view", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads and saves the single site settings form", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/admin/site-settings" && !init?.method) {
        return jsonResponse({
          id: "default",
          siteName: "Check CX",
          statusTitle: "AI Model Status",
          description: "",
          logoUrl: "",
          faviconUrl: "",
          publicOrigin: "",
          defaultCheckIntervalSeconds: 60,
          notificationCooldownSeconds: 300,
          createdAtMs: 1,
          updatedAtMs: 1,
        });
      }
      if (path === "/api/admin/site-settings" && init?.method === "PUT") {
        return jsonResponse({
          id: "default",
          siteName: "Production Model Status",
          statusTitle: "AI Channel Status",
          description: "Production AI channel status",
          logoUrl: "https://example.com/logo.png",
          faviconUrl: "https://example.com/favicon.ico",
          publicOrigin: "https://status.example.com",
          defaultCheckIntervalSeconds: 120,
          notificationCooldownSeconds: 300,
          createdAtMs: 1,
          updatedAtMs: 2,
        });
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminShell
        activeView="site-settings"
        summary={summary}
        onViewChange={() => {}}
      />
    );

    const siteName = await screen.findByLabelText("站点名称");
    fireEvent.change(siteName, {
      target: { value: "Production Model Status" },
    });
    fireEvent.change(screen.getByLabelText("状态页标题"), {
      target: { value: "AI Channel Status" },
    });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "Production AI channel status" },
    });
    fireEvent.change(screen.getByLabelText("Logo URL"), {
      target: { value: "https://example.com/logo.png" },
    });
    fireEvent.change(screen.getByLabelText("Favicon URL"), {
      target: { value: "https://example.com/favicon.ico" },
    });
    fireEvent.change(screen.getByLabelText("公开域名"), {
      target: { value: "https://status.example.com" },
    });
    fireEvent.change(screen.getByLabelText("默认检查频次（秒）"), {
      target: { value: "120" },
    });

    fireEvent.click(screen.getByRole("button", { name: "保存站点设置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/site-settings",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("Production Model Status"),
        })
      );
    });
    expect(await screen.findByText("站点设置已保存")).not.toBeNull();
  });
});
