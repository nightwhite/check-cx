import { Hono } from "hono";

import { healthRoutes } from "./routes/health";

export function createWorkerApp() {
  const app = new Hono();

  app.route("/api/health", healthRoutes);

  return app;
}
