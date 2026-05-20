import { Hono } from "hono";

import { adminAuthRoutes } from "./auth";
import { adminConfigRoutes } from "./configs";
import { adminGroupRoutes } from "./groups";
import { requireAdminSession } from "./guard";
import { adminModelRoutes } from "./models";
import { adminNotificationRoutes } from "./notifications";
import { adminRuntimeRoutes } from "./runtime";
import { adminSummaryRoutes } from "./summary";
import { adminTemplateRoutes } from "./templates";

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.route("/", adminAuthRoutes);
adminRoutes.use("/*", requireAdminSession);
adminRoutes.route("/summary", adminSummaryRoutes);
adminRoutes.route("/runtime", adminRuntimeRoutes);
adminRoutes.route("/templates", adminTemplateRoutes);
adminRoutes.route("/models", adminModelRoutes);
adminRoutes.route("/configs", adminConfigRoutes);
adminRoutes.route("/groups", adminGroupRoutes);
adminRoutes.route("/notifications", adminNotificationRoutes);
