import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import type { AdminSummary } from "./admin-types";

interface OverviewViewProps {
  summary: AdminSummary;
}

export function OverviewView({ summary }: OverviewViewProps) {
  return (
    <section className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <div>
          <h1 className="text-xl font-semibold tracking-normal">概览</h1>
          <p className="text-sm text-muted-foreground">配置与运行状态</p>
        </div>
        <Badge variant={summary.recentErrorCount > 0 ? "danger" : "success"}>
          {summary.recentErrorCount > 0 ? "有异常" : "稳定"}
        </Badge>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Provider 配置" value={summary.configCount} />
        <MetricCard label="启用配置" value={summary.enabledConfigCount} />
        <MetricCard label="维护中" value={summary.maintenanceConfigCount} />
        <MetricCard label="模型" value={summary.modelCount} />
        <MetricCard label="请求模板" value={summary.templateCount} />
        <MetricCard label="分组" value={summary.groupCount} />
        <MetricCard label="通知" value={summary.activeNotificationCount} />
        <MetricCard label="近期异常" value={summary.recentErrorCount} />
      </div>
    </section>
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

export function SmallStatusCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card className="rounded-lg">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="text-lg font-semibold tracking-normal">{value}</p>
        {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}
