import { Hono } from "hono";

export const adminSummaryRoutes = new Hono<{ Bindings: Env }>().get(
  "/",
  async (c) => {
    const [
      models,
      configs,
      enabledConfigs,
      maintenanceConfigs,
      templates,
      groups,
      activeNotifications,
      recentErrors,
    ] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM check_models").first<{
        count: number;
      }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM check_configs").first<{
        count: number;
      }>(),
      c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM check_configs WHERE enabled = 1"
      ).first<{ count: number }>(),
      c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM check_configs WHERE is_maintenance = 1"
      ).first<{ count: number }>(),
      c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM check_request_templates"
      ).first<{ count: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM group_info").first<{
        count: number;
      }>(),
      c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM system_notifications WHERE is_active = 1"
      ).first<{ count: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS count FROM check_history
         WHERE status IN ('failed', 'validation_failed', 'error')`
      ).first<{ count: number }>(),
    ]);

    return c.json({
      modelCount: models?.count ?? 0,
      configCount: configs?.count ?? 0,
      enabledConfigCount: enabledConfigs?.count ?? 0,
      maintenanceConfigCount: maintenanceConfigs?.count ?? 0,
      templateCount: templates?.count ?? 0,
      groupCount: groups?.count ?? 0,
      activeNotificationCount: activeNotifications?.count ?? 0,
      recentErrorCount: recentErrors?.count ?? 0,
    });
  }
);
