import * as React from "react";

import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { getAdminRuntime } from "./admin-api";
import type { AdminRuntimeStatus } from "./admin-types";
import { SmallStatusCard } from "./overview-view";
import { errorMessage } from "./use-admin-resource";
import { AdminViewLayout } from "./view-layout";

export function RuntimeView() {
  const [status, setStatus] = React.useState<AdminRuntimeStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const nextStatus = await getAdminRuntime();
        if (!cancelled) {
          setStatus(nextStatus);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(errorMessage(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminViewLayout title="运行状态" description="查看 Cron 与最近任务结果">
      {loading ? <p className="text-sm text-muted-foreground">正在加载运行状态</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {status ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SmallStatusCard
              title="Cron"
              value={status.cron.label}
              detail={status.cron.expression}
            />
            <SmallStatusCard
              title="最近任务"
              value={`${status.recentRuns.length}`}
              detail="job_runs"
            />
            <SmallStatusCard
              title="当前锁"
              value={`${status.locks.length}`}
              detail="job_locks"
            />
            <SmallStatusCard
              title="最近检查"
              value={status.latestCheck ? formatTime(status.latestCheck.checkedAtMs) : "暂无"}
            />
          </div>
          <RuntimeTable
            title="最近 job_runs"
            emptyText="暂无任务记录"
            headers={["任务", "状态", "检查数", "开始时间", "错误"]}
            rows={status.recentRuns.map((run) => [
              run.jobName,
              <Badge key="status" variant={run.status === "success" ? "success" : "danger"}>
                {run.status}
              </Badge>,
              `${run.checkedCount}`,
              formatTime(run.startedAtMs),
              run.errorMessage ?? "无",
            ])}
          />
          <RuntimeTable
            title="当前 job_locks"
            emptyText="暂无锁"
            headers={["任务", "Owner", "锁定到", "更新时间"]}
            rows={status.locks.map((lock) => [
              lock.jobName,
              lock.ownerId,
              formatTime(lock.lockedUntilMs),
              formatTime(lock.updatedAtMs),
            ])}
          />
          <RuntimeTable
            title="最近 dashboard snapshot"
            emptyText="暂无快照"
            headers={["Key", "周期", "生成时间"]}
            rows={status.snapshots.map((snapshot) => [
              snapshot.snapshotKey,
              snapshot.period,
              formatTime(snapshot.generatedAtMs),
            ])}
          />
        </div>
      ) : null}
    </AdminViewLayout>
  );
}

function RuntimeTable({
  title,
  emptyText,
  headers,
  rows,
}: {
  title: string;
  emptyText: string;
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <Card className="rounded-lg">
      <CardHeader className="p-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={`${title}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={`${title}-${rowIndex}-${cellIndex}`}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
