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
        status: "operational",
        latencyMs: 120,
        pingLatencyMs: 12,
        checkedAt: "2026-05-03T00:00:00.000Z",
        message: "OK",
        groupName: "core",
      },
      items: [],
    },
  ],
  groupInfos: [],
  lastUpdated: "2026-05-03T00:00:00.000Z",
  total: 1,
  pollIntervalLabel: "60 秒",
  pollIntervalMs: 1_000,
  availabilityStats: {},
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
});
