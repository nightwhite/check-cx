import { createWorkerApp } from "./app";
import { runHealthCheckJob } from "./jobs";

const app = createWorkerApp();

interface FaviconSettingsRow {
  favicon_url: string | null;
}

function normalizeAdminPath(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    return "/admin";
  }

  const path = value.trim();
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  const normalized = withLeadingSlash.replace(/\/+$/g, "");
  return normalized || "/admin";
}

function isAdminPath(pathname: string, adminPath: string): boolean {
  return pathname === adminPath || pathname.startsWith(`${adminPath}/`);
}

function adminShellRequest(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = "/admin/";
  url.search = "";
  return new Request(url, request);
}

async function configuredFaviconResponse(env: Env) {
  const row = await env.DB.prepare(
    "SELECT favicon_url FROM site_settings WHERE id = 'default'"
  ).first<FaviconSettingsRow>();
  if (!row?.favicon_url) {
    return null;
  }

  const response = await fetch(row.favicon_url);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/favicon.ico") {
      const faviconResponse = await configuredFaviconResponse(env);
      if (faviconResponse) {
        return faviconResponse;
      }
    }

    if (url.pathname === "/group/SU8" || url.pathname === "/group/SU8/") {
      url.pathname = "/";
      url.search = "";
      return Response.redirect(url.toString(), 307);
    }

    const response = await app.fetch(request, env, ctx);
    const pathname = url.pathname;
    if (response.status !== 404 || pathname.startsWith("/api/")) {
      return response;
    }

    if (isAdminPath(pathname, normalizeAdminPath(env.ADMIN_PATH))) {
      return env.ASSETS.fetch(adminShellRequest(request));
    }

    return env.ASSETS.fetch(request);
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runHealthCheckJob(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
