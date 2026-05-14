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
        name: "OpenAI",
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
        groupName: "core",
      },
      items: [
        {
          id: "core-1",
          name: "OpenAI",
          type: "openai",
          endpoint: "https://api.openai.com/v1/chat/completions",
          model: "gpt-4o-mini",
          status: "operational",
          latencyMs: 120,
          pingLatencyMs: 12,
          checkedAt: "2026-05-03T00:00:00.000Z",
          message: "OK",
          groupName: "core",
        },
        {
          id: "core-1",
          name: "OpenAI",
          type: "openai",
          endpoint: "https://api.openai.com/v1/chat/completions",
          model: "gpt-4o-mini",
          status: "failed",
          latencyMs: null,
          pingLatencyMs: 12,
          checkedAt: "2026-05-02T00:00:00.000Z",
          message: "Provider returned HTTP 500",
          groupName: "core",
        },
      ],
    },
  ],
  groupInfos: [
    {
      groupName: "core",
      websiteUrl: "https://core.example",
      tags: "prod,core",
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
    expect(screen.getByText("OpenAI")).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Anthropic")).not.toBeNull();
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

  it("initializes the group filter from group deep links", async () => {
    window.history.replaceState({}, "", "/group/core");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(baseData))
    );

    render(<DashboardIsland />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByDisplayValue("core")).not.toBeNull();
  });

  it("filters ungrouped deep links using the legacy sentinel group", async () => {
    window.history.replaceState({}, "", "/group/__ungrouped__");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          ...baseData,
          providerTimelines: [
            ...baseData.providerTimelines,
            {
              id: "solo-1",
              latest: {
                ...baseData.providerTimelines[0].latest,
                id: "solo-1",
                name: "Ungrouped",
                groupName: null,
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
    expect(screen.getByText("Ungrouped")).not.toBeNull();
    expect(screen.queryByText("OpenAI")).toBeNull();
  });


  it("renders accessible filters, group metadata, availability, timeline, message, and official status", async () => {
    window.history.replaceState({}, "", "/group/core");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(baseData))
    );

    render(<DashboardIsland />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByLabelText("搜索 Provider、模型、端点或分组")).not.toBeNull();
    expect(screen.getByLabelText("分组筛选")).not.toBeNull();
    expect(screen.getByText("https://core.example")).not.toBeNull();
    expect(screen.getByText("prod")).not.toBeNull();
    expect(screen.getByText("7 天可用率 90%")).not.toBeNull();
    expect(screen.getByText("趋势 2 点")).not.toBeNull();
    expect(screen.getByText("Provider returned HTTP 500")).not.toBeNull();
    expect(screen.getByText("官方状态：OpenAI incident")).not.toBeNull();
  });
});
