// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import { AdminIsland } from "../../../src/components/admin/admin-island";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("AdminIsland", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows token login when there is no active session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ authenticated: false }))
    );

    render(<AdminIsland />);
    await flush();

    expect(screen.getByRole("heading", { name: "管理登录" })).not.toBeNull();
    expect(screen.getByLabelText("Admin token")).not.toBeNull();
  });

  it("shows unavailable state when ADMIN_TOKEN is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "admin_unavailable" }, 503))
    );

    render(<AdminIsland />);
    await flush();

    expect(screen.getByText("管理台未配置")).not.toBeNull();
  });

  it("logs in and renders the admin shell", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, authenticated: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          modelCount: 1,
          configCount: 2,
          enabledConfigCount: 2,
          maintenanceConfigCount: 0,
          templateCount: 1,
          groupCount: 1,
          activeNotificationCount: 0,
          recentErrorCount: 0,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminIsland />);
    await flush();
    fireEvent.change(screen.getByLabelText("Admin token"), {
      target: { value: "secret-admin-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await flush();
    await flush();

    expect(screen.getByRole("heading", { name: "概览" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "监控项" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "渠道" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "运行状态" })).not.toBeNull();
    expect(screen.getByLabelText("监控项: 2")).not.toBeNull();
  });

  it("returns to login when the session expires", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: true }))
      .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminIsland />);
    await flush();
    await flush();

    expect(screen.getByRole("heading", { name: "管理登录" })).not.toBeNull();
  });
});
