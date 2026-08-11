import type { AdminSummary, AdminView } from "./admin-types";
import { AdminNav } from "./admin-nav";
import { ChannelsView } from "./channels-view";
import { ConfigsView } from "./configs-view";
import { GroupsView } from "./groups-view";
import { ModelsView } from "./models-view";
import { NotificationSettingsView } from "./notification-settings-view";
import { NotificationsView } from "./notifications-view";
import { OverviewView } from "./overview-view";
import { RuntimeView } from "./runtime-view";
import { SiteSettingsView } from "./site-settings-view";
import { TemplatesView } from "./templates-view";

interface AdminShellProps {
  activeView: AdminView;
  summary: AdminSummary | null;
  onViewChange(view: AdminView): void;
}

const emptySummary: AdminSummary = {
  modelCount: 0,
  configCount: 0,
  enabledConfigCount: 0,
  maintenanceConfigCount: 0,
  templateCount: 0,
  groupCount: 0,
  activeNotificationCount: 0,
  recentErrorCount: 0,
};

export function AdminShell({
  activeView,
  summary,
  onViewChange,
}: AdminShellProps) {
  const data = summary ?? emptySummary;
  return (
    <main className="min-h-screen overflow-x-hidden bg-background px-4 py-4 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1440px] min-w-0 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-lg border bg-card p-3 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <div className="mb-4 px-2">
            <p className="text-sm font-semibold">Check CX Admin</p>
            <p className="text-xs text-muted-foreground">配置控制台</p>
          </div>
          <AdminNav activeView={activeView} onChange={onViewChange} />
        </aside>
        <div className="min-w-0">{renderView(activeView, data)}</div>
      </div>
    </main>
  );
}

function renderView(view: AdminView, summary: AdminSummary) {
  switch (view) {
    case "overview":
      return <OverviewView summary={summary} />;
    case "site-settings":
      return <SiteSettingsView />;
    case "channels":
      return <ChannelsView />;
    case "configs":
      return <ConfigsView />;
    case "models":
      return <ModelsView />;
    case "templates":
      return <TemplatesView />;
    case "groups":
      return <GroupsView />;
    case "notifications":
      return <NotificationsView />;
    case "notification-settings":
      return <NotificationSettingsView />;
    case "runtime":
      return <RuntimeView />;
  }
}
