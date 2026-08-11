import { describe, expect, it, vi } from "vitest";

import {
  processNotificationEvents,
  type NotificationEventExecutor,
} from "../../../src/worker/jobs/notification-events";
import type { WorkerCheckResult } from "../../../src/worker/providers";

class FakeStatement {
  constructor(
    private readonly db: FakeNotificationDb,
    private readonly query: string,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new FakeStatement(this.db, this.query, values);
  }

  async first<T>() {
    if (this.query.includes("notification_events")) {
      const configId = String(this.values[0]);
      const eventType = String(this.values[1]);
      const sentAfterMs = Number(this.values[2]);
      const event = this.db.events.find(
        (item) =>
          item.configId === configId &&
          item.eventType === eventType &&
          item.sentAtMs >= sentAfterMs
      );
      return (event ? { sent_at_ms: event.sentAtMs } : null) as T | null;
    }
    return null as T | null;
  }

  async run() {
    if (this.query.includes("INSERT INTO notification_events")) {
      this.db.events.push({
        id: String(this.values[0]),
        configId: String(this.values[1]),
        eventType: String(this.values[2]),
        status: String(this.values[3]),
        sentAtMs: Number(this.values[4]),
        message: this.values[5] === null ? null : String(this.values[5]),
      });
    }
    return { meta: { changes: 1 } };
  }
}

class FakeNotificationDb implements NotificationEventExecutor {
  readonly events: Array<{
    id: string;
    configId: string;
    eventType: string;
    status: string;
    sentAtMs: number;
    message: string | null;
  }> = [];

  prepare(query: string) {
    return new FakeStatement(this, query);
  }
}

function result(status: WorkerCheckResult["status"]): WorkerCheckResult {
  return {
    id: "config-1",
    name: "Claude Sonnet",
    type: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-sonnet-4-5",
    status,
    latencyMs: 900,
    pingLatencyMs: 80,
    checkedAt: "2026-06-07T10:00:00.000Z",
    message: "slow",
    channelName: "Anthropic Official",
  };
}

const settings = {
  enabled: true,
  webhookUrl: "https://open.feishu.cn/webhook/test",
  notifyDegraded: true,
  notifyFailed: true,
  notifyRecovered: true,
};

const site = {
  siteName: "AI Status",
  publicOrigin: "https://status.example.com",
  notificationCooldownSeconds: 300,
};

describe("notification events", () => {
  it("sends degraded notification when status changes from operational to degraded", async () => {
    const db = new FakeNotificationDb();
    const send = vi.fn(async () => undefined);

    await processNotificationEvents({
      db,
      results: [result("degraded")],
      previousStatuses: new Map([["config-1", "operational"]]),
      site,
      settings,
      nowMs: 1_000,
      send,
    });

    expect(send).toHaveBeenCalledOnce();
    expect(db.events[0]).toMatchObject({
      configId: "config-1",
      eventType: "degraded",
      status: "degraded",
    });
  });

  it("sends failed notification when status changes to failed", async () => {
    const db = new FakeNotificationDb();
    const send = vi.fn(async () => undefined);

    await processNotificationEvents({
      db,
      results: [result("failed")],
      previousStatuses: new Map([["config-1", "degraded"]]),
      site,
      settings,
      nowMs: 1_000,
      send,
    });

    expect(send).toHaveBeenCalledOnce();
    expect(db.events[0].eventType).toBe("failed");
  });

  it("sends recovered notification when status changes back to operational", async () => {
    const db = new FakeNotificationDb();
    const send = vi.fn(async () => undefined);

    await processNotificationEvents({
      db,
      results: [result("operational")],
      previousStatuses: new Map([["config-1", "failed"]]),
      site,
      settings,
      nowMs: 1_000,
      send,
    });

    expect(send).toHaveBeenCalledOnce();
    expect(db.events[0].eventType).toBe("recovered");
  });

  it("does not notify for maintenance", async () => {
    const db = new FakeNotificationDb();
    const send = vi.fn(async () => undefined);

    await processNotificationEvents({
      db,
      results: [result("maintenance")],
      previousStatuses: new Map([["config-1", "failed"]]),
      site,
      settings,
      nowMs: 1_000,
      send,
    });

    expect(send).not.toHaveBeenCalled();
    expect(db.events).toHaveLength(0);
  });

  it("does not resend the same event type within cooldown", async () => {
    const db = new FakeNotificationDb();
    db.events.push({
      id: "event-1",
      configId: "config-1",
      eventType: "failed",
      status: "failed",
      sentAtMs: 900,
      message: null,
    });
    const send = vi.fn(async () => undefined);

    await processNotificationEvents({
      db,
      results: [result("failed")],
      previousStatuses: new Map([["config-1", "operational"]]),
      site,
      settings,
      nowMs: 1_000,
      send,
    });

    expect(send).not.toHaveBeenCalled();
    expect(db.events).toHaveLength(1);
  });
});
