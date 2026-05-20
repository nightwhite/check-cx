import { createWorkerApp } from "./app";
import { runHealthCheckJob } from "./jobs";

const app = createWorkerApp();

function normalizeAdminPath(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    return "/admin";
  }

  const path = value.trim();
  return path.startsWith("/") ? path : `/${path}`;
}

function isAdminPath(pathname: string, adminPath: string): boolean {
  return pathname === adminPath || pathname.startsWith(`${adminPath}/`);
}

function adminShellRequest(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = "/admin/index.html";
  url.search = "";
  return new Request(url, request);
}

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    const pathname = new URL(request.url).pathname;
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
