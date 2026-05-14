import { createWorkerApp } from "./app";
import { runHealthCheckJob } from "./jobs";

const app = createWorkerApp();

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    const pathname = new URL(request.url).pathname;
    if (response.status !== 404 || pathname.startsWith("/api/")) {
      return response;
    }

    return env.ASSETS.fetch(request);
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runHealthCheckJob(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
