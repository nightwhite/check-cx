import { createWorkerApp } from "./app";

const app = createWorkerApp();

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    if (response.status !== 404) {
      return response;
    }

    return env.ASSETS.fetch(request);
  },
  scheduled(_controller, _env, ctx) {
    ctx.waitUntil(Promise.resolve());
  },
} satisfies ExportedHandler<Env>;
