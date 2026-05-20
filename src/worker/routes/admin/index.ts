import { Hono } from "hono";

import { adminAuthRoutes } from "./auth";

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.route("/", adminAuthRoutes);
