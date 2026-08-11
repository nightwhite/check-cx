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

describe("channels view", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lists channels and creates a new channel", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/admin/channels" && !init?.method) {
        return jsonResponse([
          {
            id: "channel-anthropic",
            name: "Anthropic Official",
            logoUrl: "https://example.com/anthropic.png",
            websiteUrl: "https://www.anthropic.com/",
            statusPageUrl: "https://status.anthropic.com/",
            sortOrder: 10,
            enabled: true,
            createdAtMs: 1,
            updatedAtMs: 1,
          },
        ]);
      }
      if (path === "/api/admin/channels" && init?.method === "POST") {
        return jsonResponse(
          {
            id: "channel-aws",
            name: "AWS Bedrock",
            logoUrl: "",
            websiteUrl: "https://aws.amazon.com/bedrock/",
            statusPageUrl: "https://health.aws.amazon.com/health/status",
            sortOrder: 20,
            enabled: true,
            createdAtMs: 2,
            updatedAtMs: 2,
          },
          201
        );
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminShell activeView="channels" summary={summary} onViewChange={() => {}} />
    );

    expect(await screen.findByText("Anthropic Official")).not.toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "新增渠道" })[0]);
    fireEvent.change(screen.getByLabelText("渠道名称"), {
      target: { value: "AWS Bedrock" },
    });
    fireEvent.change(screen.getByLabelText("官网链接"), {
      target: { value: "https://aws.amazon.com/bedrock/" },
    });
    fireEvent.change(screen.getByLabelText("官方状态页链接"), {
      target: { value: "https://health.aws.amazon.com/health/status" },
    });
    fireEvent.change(screen.getByLabelText("排序"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存渠道" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/channels",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("AWS Bedrock"),
        })
      );
    });
    expect(await screen.findByText("AWS Bedrock")).not.toBeNull();
  });
});
