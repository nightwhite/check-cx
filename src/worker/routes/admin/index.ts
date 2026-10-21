import { Hono } from "hono";

import { adminAuthRoutes } from "./auth";
import { adminChannelRoutes } from "./channels";
import { adminConfigRoutes } from "./configs";
import { adminGroupRoutes } from "./groups";
import { requireAdminSession } from "./guard";
import { adminLogRoutes } from "./logs";
import { adminModelRoutes } from "./models";
import { adminNotificationRoutes } from "./notifications";
import { adminNotificationSettingsRoutes } from "./notification-settings";
import { adminRuntimeRoutes } from "./runtime";
import { adminSiteSettingsRoutes } from "./site-settings";
import { adminSummaryRoutes } from "./summary";
import { adminTemplateRoutes } from "./templates";
import { createUpstreamModelRoutes } from "./upstream-models";

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.route("/", adminAuthRoutes);
adminRoutes.use("/*", requireAdminSession);
adminRoutes.route("/summary", adminSummaryRoutes);
adminRoutes.route("/site-settings", adminSiteSettingsRoutes);
adminRoutes.route("/channels", adminChannelRoutes);
adminRoutes.route("/channels", createUpstreamModelRoutes());
adminRoutes.route("/runtime", adminRuntimeRoutes);
adminRoutes.route("/logs", adminLogRoutes);
adminRoutes.route("/templates", adminTemplateRoutes);
adminRoutes.route("/models", adminModelRoutes);
adminRoutes.route("/configs", adminConfigRoutes);
adminRoutes.route("/groups", adminGroupRoutes);
adminRoutes.route("/notifications", adminNotificationRoutes);
adminRoutes.route("/notification-settings", adminNotificationSettingsRoutes);
