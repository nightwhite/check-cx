// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import { DashboardIsland } from "../../src/components/dashboard/dashboard-island";
import type { DashboardData } from "../../lib/types";

const baseData: DashboardData = {
  providerTimelines: [
    {
      id: "core-1",
      latest: {
        id: "core-1",
        name: "SU8 gpt-5.5",
        type: "openai",
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
        status: "failed",
        latencyMs: 120,
        pingLatencyMs: 12,
        checkedAt: "2026-05-03T00:00:00.000Z",
        message: "Provider returned HTTP 500",
        officialStatus: {
          status: "degraded",
          message: "OpenAI incident",
          checkedAt: "2026-05-03T00:00:00.000Z",
          affectedComponents: ["API"],
        },
        groupName: "SU8",
      },
      items: [
        {
          id: "core-1",
          name: "SU8 gpt-5.5",
          type: "openai",
          endpoint: "https://api.openai.com/v1/chat/completions",
          model: "gpt-4o-mini",
          status: "operational",
          latencyMs: 120,
          pingLatencyMs: 12,
          checkedAt: "2026-05-03T00:00:00.000Z",
          message: "OK",
          groupName: "SU8",
        },
        {
          id: "core-1",
          name: "SU8 gpt-5.5",
          type: "openai",
          endpoint: "https://api.openai.com/v1/chat/completions",
          model: "gpt-4o-mini",
          status: "failed",
          latencyMs: null,
          pingLatencyMs: 12,
          checkedAt: "2026-05-02T00:00:00.000Z",
          message: "Provider returned HTTP 500",
          groupName: "SU8",
        },
      ],
    },
  ],
  groupInfos: [
    {
      groupName: "SU8",
      websiteUrl: "https://www.su8.codes",
      tags: "prod,su8",
    },
  ],
  lastUpdated: "2026-05-03T00:00:00.000Z",
  total: 1,
  pollIntervalLabel: "60 秒",
  pollIntervalMs: 1_000,
  availabilityStats: {
    "core-1": [
      {
        period: "7d",
        totalChecks: 10,
        operationalCount: 9,
        availabilityPct: 90,
      },
    ],
  },
  trendPeriod: "7d",
  generatedAt: 1_775_174_400_000,
};

function jsonResponse(data: DashboardData) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("DashboardIsland", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("auto refreshes using pollIntervalMs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(baseData))
      .mockResolvedValueOnce(
        jsonResponse({
          ...baseData,
          providerTimelines: [
            {
              ...baseData.providerTimelines[0],
              latest: {
                ...baseData.providerTimelines[0].latest,
                name: "Anthropic",
              },
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardIsland />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "gpt-5.5" })).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "Anthropic" })).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores stale responses from superseded requests", async () => {
    let resolveFirst: (response: Response) => void = () => undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...baseData,
          trendPeriod: "15d",
          providerTimelines: [
            {
              ...baseData.providerTimelines[0],
              latest: {
                ...baseData.providerTimelines[0].latest,
                name: "Fresh",
              },
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardIsland />);
    fireEvent.click(screen.getByRole("button", { name: "15 天" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Fresh")).not.toBeNull();

    resolveFirst(
      jsonResponse({
        ...baseData,
        providerTimelines: [
          {
            ...baseData.providerTimelines[0],
            latest: {
              ...baseData.providerTimelines[0].latest,
              name: "Stale",
            },
          },
        ],
      })
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText("Stale")).toBeNull();
    expect(screen.getByText("Fresh")).not.toBeNull();
  });

  it("reloads dashboard from the toolbar refresh button", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(baseData))
      .mockResolvedValueOnce(
        jsonResponse({
          ...baseData,
          providerTimelines: [
            {
              ...baseData.providerTimelines[0],
              latest: {
                ...baseData.providerTimelines[0].latest,
                name: "SU8 gpt-4o",
              },
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardIsland />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "gpt-4o" })).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses SU8.Codes as the public site identity instead of the database group name", async () => {
    window.history.replaceState({}, "", "/group/OpenAI");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(baseData))
    );

    render(<DashboardIsland />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "SU8.Codes" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "OpenAI" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("heading", { name: "Check CX" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "SU8", level: 2 })).toBeNull();
    expect(screen.queryByRole("heading", { name: "SU8 gpt-5.5" })).toBeNull();
    expect(screen.getByRole("heading", { name: "gpt-5.5" })).not.toBeNull();
  });

  it("filters group deep links by provider family rather than database group name", async () => {
    window.history.replaceState({}, "", "/group/Claude");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          ...baseData,
          providerTimelines: [
            ...baseData.providerTimelines,
            {
              id: "claude-1",
              latest: {
                ...baseData.providerTimelines[0].latest,
                id: "claude-1",
                name: "Claude",
                type: "anthropic",
                groupName: "SU8",
              },
              items: [],
            },
          ],
        })
      )
    );

    render(<DashboardIsland />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "SU8.Codes" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Claude" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Claude" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "OpenAI" })).toBeNull();
  });


  it("renders accessible filters, SU8 metadata, availability, timeline, message, and official status", async () => {
    window.history.replaceState({}, "", "/group/OpenAI");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(baseData))
    );

    render(<DashboardIsland />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByLabelText("搜索 Provider、模型或端点")).not.toBeNull();
    expect(screen.getByRole("group", { name: "Provider 筛选" })).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "Provider 筛选" })).toBeNull();
    expect(screen.getByText("Status Page")).not.toBeNull();
    expect(screen.getByText("https://www.su8.codes")).not.toBeNull();
    expect(screen.getByLabelText("OpenAI provider")).not.toBeNull();
    expect(screen.queryByText("OP")).toBeNull();
    expect(screen.queryByText("prod")).toBeNull();
    expect(screen.queryByText("su8")).toBeNull();
    expect(screen.queryByText("1 个配置")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "7 天" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("90.00%")).not.toBeNull();
    expect(screen.getByText("最近 2 次检查")).not.toBeNull();
    expect(screen.queryByText("过去")).toBeNull();
    expect(screen.queryByText("现在")).toBeNull();
    expect(screen.getByText("Provider returned HTTP 500")).not.toBeNull();
    expect(screen.getByText("官方状态：OpenAI incident")).not.toBeNull();
  });
});
