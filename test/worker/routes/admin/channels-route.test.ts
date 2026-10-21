import { describe, expect, it } from "vitest";

import { createWorkerApp } from "../../../../src/worker/app";
import {
  createAdminRouteEnv,
  jsonRequest,
  loginAdmin,
} from "./admin-route-test-helpers";

async function setup() {
  const app = createWorkerApp();
  const env = await createAdminRouteEnv();
  const cookie = await loginAdmin(app, env);
  return { app, env, cookie };
}

describe("admin channels route", () => {
  it("creates and lists channels ordered by sort order", async () => {
    const { app, env, cookie } = await setup();

    const second = await app.request(
      "http://example.com/api/admin/channels",
      jsonRequest("POST", cookie, {
        name: "AWS Bedrock",
        logoUrl: "https://example.com/aws.png",
        websiteUrl: "https://aws.amazon.com/bedrock/",
        statusPageUrl: "https://health.aws.amazon.com/health/status",
        sortOrder: 20,
        enabled: true,
      }),
      env
    );
    expect(second.status).toBe(201);

    const first = await app.request(
      "http://example.com/api/admin/channels",
      jsonRequest("POST", cookie, {
        name: "Anthropic Official",
        logoUrl: "https://example.com/anthropic.png",
        websiteUrl: "https://www.anthropic.com/",
        statusPageUrl: "https://status.anthropic.com/",
        sortOrder: 10,
        enabled: true,
      }),
      env
    );
    expect(first.status).toBe(201);

    const listResponse = await app.request(
      "http://example.com/api/admin/channels",
      { headers: { Cookie: cookie } },
      env
    );
    expect(listResponse.status).toBe(200);
    const channels = (await listResponse.json()) as Array<{ name: string }>;
    expect(channels.map((channel) => channel.name)).toEqual([
      "Anthropic Official",
      "AWS Bedrock",
    ]);
  });

  it("updates channel logo urls and status page urls", async () => {
    const { app, env, cookie } = await setup();

    const create = await app.request(
      "http://example.com/api/admin/channels",
      jsonRequest("POST", cookie, {
        name: "Anthropic Official",
        logoUrl: null,
        websiteUrl: null,
        statusPageUrl: null,
        sortOrder: 10,
        enabled: true,
      }),
      env
    );
    expect(create.status).toBe(201);
    const channel = (await create.json()) as { id: string };

    const update = await app.request(
      `http://example.com/api/admin/channels/${channel.id}`,
      jsonRequest("PUT", cookie, {
        name: "Anthropic Official",
        logoUrl: "https://example.com/anthropic.png",
        websiteUrl: "https://www.anthropic.com/",
        statusPageUrl: "https://status.anthropic.com/",
        sortOrder: 5,
        enabled: true,
      }),
      env
    );

    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toMatchObject({
      id: channel.id,
      logoUrl: "https://example.com/anthropic.png",
      statusPageUrl: "https://status.anthropic.com/",
      sortOrder: 5,
    });
  });

  it.each([
    ["http://10.0.0.5:3000/", "http://10.0.0.5:3000"],
    ["192.168.1.10:8080/v1", "http://192.168.1.10:8080/v1"],
    ["localhost:3000", "http://localhost:3000"],
  ])("accepts http intranet base url %s", async (input, expected) => {
    const { app, env, cookie } = await setup();

    const response = await app.request(
      "http://example.com/api/admin/channels",
      jsonRequest("POST", cookie, {
        name: "Intranet Relay",
        baseUrl: input,
        sortOrder: 10,
        enabled: true,
      }),
      env
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ baseUrl: expected });
  });

  it("rejects non-http base url schemes", async () => {
    const { app, env, cookie } = await setup();

    const response = await app.request(
      "http://example.com/api/admin/channels",
      jsonRequest("POST", cookie, {
        name: "Bad Relay",
        baseUrl: "ftp://10.0.0.5",
        sortOrder: 10,
        enabled: true,
      }),
      env
    );

    expect(response.status).toBe(400);
  });

  it("saves the channel direct host header and requires an http base url", async () => {
    const { app, env, cookie } = await setup();
    const payload = {
      name: "Intranet Relay",
      baseUrl: "http://10.0.0.5:8080",
      hostHeader: "www.example.com",
      sortOrder: 10,
      enabled: true,
    };

    const created = await app.request(
      "http://example.com/api/admin/channels",
      jsonRequest("POST", cookie, payload),
      env
    );
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      baseUrl: "http://10.0.0.5:8080",
      hostHeader: "www.example.com",
    });

    const httpsBase = await app.request(
      "http://example.com/api/admin/channels",
      jsonRequest("POST", cookie, {
        ...payload,
        name: "Https Relay",
        baseUrl: "https://relay.example.com",
      }),
      env
    );
    expect(httpsBase.status).toBe(400);

    const badHost = await app.request(
      "http://example.com/api/admin/channels",
      jsonRequest("POST", cookie, {
        ...payload,
        name: "Bad Host",
        hostHeader: "www.example.com:8080",
      }),
      env
    );
    expect(badHost.status).toBe(400);
  });

  it("rejects duplicate channel names", async () => {
    const { app, env, cookie } = await setup();
    const payload = {
      name: "Anthropic Official",
      logoUrl: null,
      websiteUrl: null,
      statusPageUrl: null,
      sortOrder: 10,
      enabled: true,
    };

    const first = await app.request(
      "http://example.com/api/admin/channels",
      jsonRequest("POST", cookie, payload),
      env
    );
    expect(first.status).toBe(201);

    const duplicate = await app.request(
      "http://example.com/api/admin/channels",
      jsonRequest("POST", cookie, payload),
      env
    );

    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toEqual({
      error: "渠道名称已存在",
    });
  });

  it("disables a channel without deleting monitor history", async () => {
    const { app, env, cookie } = await setup();

    const create = await app.request(
      "http://example.com/api/admin/channels",
      jsonRequest("POST", cookie, {
        name: "AWS Bedrock",
        logoUrl: null,
        websiteUrl: null,
        statusPageUrl: null,
        sortOrder: 20,
        enabled: true,
      }),
      env
    );
    expect(create.status).toBe(201);
    const channel = (await create.json()) as { id: string };

    const update = await app.request(
      `http://example.com/api/admin/channels/${channel.id}`,
      jsonRequest("PUT", cookie, {
        name: "AWS Bedrock",
        logoUrl: null,
        websiteUrl: null,
        statusPageUrl: null,
        sortOrder: 20,
        enabled: false,
      }),
      env
    );

    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toMatchObject({
      id: channel.id,
      enabled: false,
    });
  });
});
