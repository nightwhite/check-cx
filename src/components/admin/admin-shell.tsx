import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import type { AdminSummary, AdminView } from "./admin-types";
import { AdminNav } from "./admin-nav";

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
    <main className="min-h-screen bg-background px-4 py-4 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1440px] gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-lg border bg-card p-3 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <div className="mb-4 px-2">
            <p className="text-sm font-semibold">Check CX Admin</p>
            <p className="text-xs text-muted-foreground">配置控制台</p>
          </div>
          <AdminNav activeView={activeView} onChange={onViewChange} />
        </aside>
        <section className="grid gap-4">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
            <div>
              <h1 className="text-xl font-semibold tracking-normal">概览</h1>
              <p className="text-sm text-muted-foreground">配置与运行入口</p>
            </div>
            <Badge variant={data.recentErrorCount > 0 ? "danger" : "success"}>
              {data.recentErrorCount > 0 ? "有异常" : "稳定"}
            </Badge>
          </header>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Provider 配置" value={data.configCount} />
            <MetricCard label="启用配置" value={data.enabledConfigCount} />
            <MetricCard label="维护中" value={data.maintenanceConfigCount} />
            <MetricCard label="模型" value={data.modelCount} />
          </div>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-base">当前视图</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {viewLabel(activeView)}
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="rounded-lg" aria-label={`${label}: ${value}`}>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-normal">{value}</p>
      </CardContent>
    </Card>
  );
}

function viewLabel(view: AdminView): string {
  switch (view) {
    case "overview":
      return "概览";
    case "configs":
      return "Provider 配置";
    case "models":
      return "模型";
    case "templates":
      return "请求模板";
    case "groups":
      return "分组";
    case "notifications":
      return "通知";
    case "runtime":
      return "运行状态";
  }
}
