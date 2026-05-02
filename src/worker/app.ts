import { Hono } from "hono";

import { dashboardRoutes } from "./routes/dashboard";
import { groupRoutes } from "./routes/group";
import { healthRoutes } from "./routes/health";
import { internalRoutes } from "./routes/internal";
import { notificationRoutes } from "./routes/notifications";
import { statusRoutes } from "./routes/status";

export function createWorkerApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.route("/api/health", healthRoutes);
  app.route("/api/dashboard", dashboardRoutes);
  app.route("/api/group", groupRoutes);
  app.route("/api/v1/status", statusRoutes);
  app.route("/api/notifications", notificationRoutes);
  app.route("/api/internal", internalRoutes);

  return app;
}
