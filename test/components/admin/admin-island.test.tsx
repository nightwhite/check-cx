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
    expect(screen.getByLabelText("管理员令牌")).not.toBeNull();
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
    fireEvent.change(screen.getByLabelText("管理员令牌"), {
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

  async function submitToken(token = "wrong-token") {
    fireEvent.change(screen.getByLabelText("管理员令牌"), {
      target: { value: token },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await flush();
    await flush();
  }

  it("shows remaining attempts after a wrong token", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
        .mockResolvedValueOnce(
          jsonResponse({ error: "unauthorized", remainingAttempts: 3 }, 401)
        )
    );

    render(<AdminIsland />);
    await flush();
    await submitToken();

    expect(screen.getByRole("alert").textContent).toBe("令牌错误，还可尝试 3 次");
  });

  it("counts down and disables login while locked", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: "too_many_attempts", retryAfterSeconds: 90 }),
            {
              status: 429,
              headers: { "content-type": "application/json", "Retry-After": "90" },
            }
          )
        )
    );

    try {
      render(<AdminIsland />);
      await flush();
      await submitToken();

      expect(screen.getByRole("alert").textContent).toBe(
        "尝试次数过多，请在 01:30 后重试"
      );
      const button = screen.getByRole("button", { name: "登录" }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.getByRole("alert").textContent).toBe(
        "尝试次数过多，请在 01:00 后重试"
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a captcha failure message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
        .mockResolvedValueOnce(jsonResponse({ error: "captcha_failed" }, 400))
    );

    render(<AdminIsland />);
    await flush();
    await submitToken();

    expect(screen.getByRole("alert").textContent).toBe("人机验证失败，请重试");
  });

  it("renders Turnstile and requires it before login", async () => {
    const render_ = vi.fn(
      (_container: HTMLElement, options: { callback(token: string): void }) => {
        options.callback("captcha-token");
        return "widget-1";
      }
    );
    const reset = vi.fn();
    window.turnstile = { render: render_, reset, remove: vi.fn() };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ authenticated: false, turnstileSiteKey: "site-key" })
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: "unauthorized", remainingAttempts: 4 }, 401)
      );
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(<AdminIsland />);
      await flush();
      await flush();

      expect(render_).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ sitekey: "site-key" })
      );
      await submitToken();

      const [, init] = fetchMock.mock.calls[1];
      expect(JSON.parse(String(init.body))).toEqual({
        token: "wrong-token",
        turnstileToken: "captcha-token",
      });
      expect(reset).toHaveBeenCalledWith("widget-1");
      expect(
        (screen.getByRole("button", { name: "登录" }) as HTMLButtonElement).disabled
      ).toBe(true);
    } finally {
      delete window.turnstile;
    }
  });
});
