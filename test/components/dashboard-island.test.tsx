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
  site: {
    siteName: "AI Status",
    statusTitle: "AI Channel Status",
    description: "Production AI status",
    logoUrl: "https://example.com/logo.png",
    faviconUrl: "https://example.com/favicon.ico",
    publicOrigin: "https://status.example.com",
  },
  channels: [
    {
      id: "channel-openai",
      name: "OpenAI Official",
      logoUrl: null,
      websiteUrl: "https://openai.com/",
      statusPageUrl: "https://status.openai.com/",
      models: [
        {
          id: "core-1",
          name: "SU8 gpt-5.5",
          type: "openai",
          model: "gpt-4o-mini",
          status: "failed",
          latencyMs: 120,
          checkedAt: "2026-05-03T00:00:00.000Z",
          message: "Provider returned HTTP 500",
          officialStatus: {
            status: "degraded",
            message: "OpenAI incident",
            checkedAt: "2026-05-03T00:00:00.000Z",
            affectedComponents: ["API"],
          },
          availability: {
            "7d": 90,
          },
          history: [
            {
              status: "operational",
              latencyMs: 120,
              checkedAt: "2026-05-03T00:00:00.000Z",
            },
            {
              status: "failed",
              latencyMs: null,
              checkedAt: "2026-05-02T00:00:00.000Z",
            },
          ],
        },
      ],
    },
  ],
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

function withFirstModelName(data: DashboardData, name: string): DashboardData {
  return {
    ...data,
    channels: [
      {
        ...data.channels[0],
        models: [
          {
            ...data.channels[0].models[0],
            name,
          },
        ],
      },
    ],
  };
}

function withClaudeChannel(data: DashboardData): DashboardData {
  return {
    ...data,
    channels: [
      ...data.channels,
      {
        id: "channel-claude",
        name: "Claude Official",
        logoUrl: null,
        websiteUrl: "https://www.anthropic.com/",
        statusPageUrl: null,
        models: [
          {
            ...data.channels[0].models[0],
            id: "claude-1",
            name: "Claude",
            type: "anthropic",
            model: "claude-sonnet-4",
            status: "operational",
            message: "OK",
            officialStatus: undefined,
          },
        ],
      },
    ],
  };
}

function withFirstModelStatus(
  data: DashboardData,
  status: DashboardData["channels"][number]["models"][number]["status"]
): DashboardData {
  return {
    ...data,
    channels: [
      {
        ...data.channels[0],
        models: [
          {
            ...data.channels[0].models[0],
            status,
          },
        ],
      },
    ],
  };
}

function withFirstModelLatency(data: DashboardData, latencyMs: number): DashboardData {
  return {
    ...data,
    channels: [
      {
        ...data.channels[0],
        models: [
          {
            ...data.channels[0].models[0],
            status: "operational",
            latencyMs,
            message: "OK",
            officialStatus: undefined,
          },
        ],
      },
    ],
  };
}

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
      .mockResolvedValueOnce(jsonResponse(withFirstModelName(baseData, "Anthropic")));
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

  it("restarts the next-check countdown after an automatic refresh", async () => {
    const now = new Date("2026-05-03T00:00:00.000Z");
    vi.setSystemTime(now);
    const fetchMock = vi.fn(async () => jsonResponse(baseData));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardIsland />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("下次检查")).not.toBeNull();
    expect(screen.getByText("1s")).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      vi.setSystemTime(new Date(now.getTime() + 1_000));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("1s")).not.toBeNull();
  });

  it("uses the URL period and marks the dashboard ready for screenshots", async () => {
    window.history.replaceState({}, "", "/?period=7d&screenshot=1");
    const fetchMock = vi.fn(async () => jsonResponse(baseData));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<DashboardIsland />);

    expect(
      container.querySelector("[data-dashboard-ready='false']")
    ).not.toBeNull();
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard?trendPeriod=7d&screenshot=1",
      expect.objectContaining({
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
    );
    expect(
      container.querySelector("[data-dashboard-ready='true']")
    ).not.toBeNull();
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
          ...withFirstModelName(baseData, "Fresh"),
          trendPeriod: "15d",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardIsland />);
    fireEvent.click(screen.getByRole("button", { name: "15 天" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Fresh")).not.toBeNull();

    resolveFirst(jsonResponse(withFirstModelName(baseData, "Stale")));
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
      .mockResolvedValueOnce(jsonResponse(withFirstModelName(baseData, "SU8 gpt-4o")));
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
    expect(screen.getByRole("heading", { name: "Status" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "模型类型筛选 OpenAI" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading", { name: "Check CX" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "SU8", level: 2 })).toBeNull();
    expect(screen.queryByRole("heading", { name: "SU8 gpt-5.5" })).toBeNull();
    expect(screen.getByRole("heading", { name: "gpt-5.5" })).not.toBeNull();
  });

  it("renders configured site and channel model rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(baseData))
    );

    render(<DashboardIsland />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "Status" })).not.toBeNull();
    expect(screen.getByText("Production AI status")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "OpenAI Official" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "官方状态页" }).getAttribute("href")).toBe("https://status.openai.com/");
    expect(
      screen
        .getAllByRole("link", { name: "官网" })
        .filter((link) => link.getAttribute("href") === "https://status.example.com")
    ).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "gpt-5.5" })).not.toBeNull();
    expect(screen.getByText("最近 2 次检查")).not.toBeNull();
  });

  it("shows status segment check time in UTC+8 on hover", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(baseData))
    );

    render(<DashboardIsland />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTitle("2026/5/3 08:00:00 · 正常 · 120 ms")).not.toBeNull();
  });

  it("filters group deep links by provider family rather than database group name", async () => {
    window.history.replaceState({}, "", "/group/Claude");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(withClaudeChannel(baseData)))
    );

    render(<DashboardIsland />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "Status" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "模型类型筛选 Claude" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("heading", { name: "Claude" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "OpenAI" })).toBeNull();
  });

  it("distinguishes filter misses from missing monitor data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(baseData))
    );

    render(<DashboardIsland />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.change(screen.getByLabelText("搜索模型、类型或端点"), {
      target: { value: "not-a-model" },
    });

    expect(screen.getByText("当前筛选下没有匹配的模型")).not.toBeNull();
    expect(screen.queryByText("暂无匹配的健康检查快照")).toBeNull();
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

    expect(screen.getByLabelText("搜索模型、类型或端点")).not.toBeNull();
    expect(screen.getByRole("button", { name: "模型类型筛选 OpenAI" })).not.toBeNull();
    expect(screen.queryByRole("group", { name: "模型类型筛选" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "模型类型筛选" })).toBeNull();
    expect(screen.getByRole("img", { name: "AI Status" }).getAttribute("src")).toBe("https://example.com/logo.png");
    expect(
      screen
        .getAllByRole("link", { name: "官网" })
        .some((link) => link.getAttribute("href") === "https://status.example.com")
    ).toBe(true);
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

  it.each([
    ["keeps the status green at 30 seconds", 30_000, "border-emerald-500/30"],
    ["turns the status yellow above 30 seconds", 30_001, "border-amber-500/30"],
  ])("%s", async (_label, latencyMs, colorClass) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(withFirstModelLatency(baseData, latencyMs)))
    );

    render(<DashboardIsland />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText("首字")).toBeNull();
    expect(screen.queryByText(`${latencyMs} ms`)).toBeNull();
    expect(screen.getAllByText("正常")[1].closest("span")?.className).toContain(
      colorClass
    );
  });

  it("uses a designed dropdown for provider filtering", async () => {
    window.history.replaceState({}, "", "/");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(withClaudeChannel(baseData)))
    );

    render(<DashboardIsland />);

    await act(async () => {
      await Promise.resolve();
    });

    const trigger = screen.getByRole("button", { name: "模型类型筛选 全部" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox", { name: "模型类型筛选" })).not.toBeNull();
    expect(screen.getByRole("option", { name: "OpenAI" })).not.toBeNull();
    expect(screen.getByRole("option", { name: "Claude" })).not.toBeNull();

    fireEvent.click(screen.getByRole("option", { name: "Claude" }));
    expect(screen.getByRole("button", { name: "模型类型筛选 Claude" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading", { name: "gpt-5.5" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Claude" })).not.toBeNull();
  });
});
