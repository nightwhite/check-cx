// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import { NotificationBanner } from "../../components/notification-banner";

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("NotificationBanner", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders valid notifications from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          {
            id: "notice-1",
            message: "Maintenance window",
            is_active: true,
            level: "warning",
            created_at: "2026-05-03T00:00:00.000Z",
          },
        ])
      )
    );

    render(<NotificationBanner />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("Maintenance window")).not.toBeNull();
  });

  it("ignores malformed notification responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          {
            id: "notice-1",
            is_active: true,
            level: "warning",
            created_at: "2026-05-03T00:00:00.000Z",
          },
        ])
      )
    );

    render(<NotificationBanner />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });
});
