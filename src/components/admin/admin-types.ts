export interface AdminSessionResponse {
  authenticated?: boolean;
  error?: string;
}

export interface AdminSummary {
  modelCount: number;
  configCount: number;
  enabledConfigCount: number;
  maintenanceConfigCount: number;
  templateCount: number;
  groupCount: number;
  activeNotificationCount: number;
  recentErrorCount: number;
}

export type AdminView =
  | "overview"
  | "configs"
  | "models"
  | "templates"
  | "groups"
  | "notifications"
  | "runtime";
