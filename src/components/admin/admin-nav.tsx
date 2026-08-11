import {
  Bell,
  Boxes,
  Gauge,
  Layers3,
  LayoutTemplate,
  Settings,
  ServerCog,
  SquareStack,
  Waypoints,
} from "lucide-react";

import { cn } from "../../../lib/utils";
import type { AdminView } from "./admin-types";

const navItems: Array<{
  value: AdminView;
  label: string;
  icon: typeof Gauge;
}> = [
  { value: "overview", label: "概览", icon: Gauge },
  { value: "site-settings", label: "站点设置", icon: Settings },
  { value: "channels", label: "渠道", icon: SquareStack },
  { value: "configs", label: "监控项", icon: ServerCog },
  { value: "models", label: "模型", icon: Layers3 },
  { value: "templates", label: "请求模板", icon: LayoutTemplate },
  { value: "groups", label: "分组", icon: Boxes },
  { value: "notifications", label: "通知", icon: Bell },
  { value: "notification-settings", label: "通知设置", icon: Bell },
  { value: "runtime", label: "运行状态", icon: Waypoints },
];

interface AdminNavProps {
  activeView: AdminView;
  onChange(view: AdminView): void;
}

export function AdminNav({ activeView, onChange }: AdminNavProps) {
  return (
    <nav className="flex flex-wrap gap-1 lg:grid">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = activeView === item.value;
        return (
          <button
            key={item.value}
            type="button"
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-foreground text-background hover:bg-foreground hover:text-background"
            )}
            onClick={() => onChange(item.value)}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
