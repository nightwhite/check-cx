import { Hono } from "hono";

import { adminAuthRoutes } from "./auth";
import { adminChannelRoutes } from "./channels";
import { adminConfigRoutes } from "./configs";
import { adminGroupRoutes } from "./groups";
import { requireAdminSession } from "./guard";
import { adminModelRoutes } from "./models";
import { adminNotificationRoutes } from "./notifications";
import { adminNotificationSettingsRoutes } from "./notification-settings";
import { adminRuntimeRoutes } from "./runtime";
import { adminSiteSettingsRoutes } from "./site-settings";
import { adminSummaryRoutes } from "./summary";
import { adminTemplateRoutes } from "./templates";

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.route("/", adminAuthRoutes);
adminRoutes.use("/*", requireAdminSession);
adminRoutes.route("/summary", adminSummaryRoutes);
adminRoutes.route("/site-settings", adminSiteSettingsRoutes);
adminRoutes.route("/channels", adminChannelRoutes);
adminRoutes.route("/runtime", adminRuntimeRoutes);
adminRoutes.route("/templates", adminTemplateRoutes);
adminRoutes.route("/models", adminModelRoutes);
adminRoutes.route("/configs", adminConfigRoutes);
adminRoutes.route("/groups", adminGroupRoutes);
adminRoutes.route("/notifications", adminNotificationRoutes);
adminRoutes.route("/notification-settings", adminNotificationSettingsRoutes);
