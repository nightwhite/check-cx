import * as React from "react";
import { RefreshCw, Search } from "lucide-react";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { cn } from "../../../lib/utils";
import { listAdminChannels, listAdminLogs } from "./admin-api";
import type {
  AdminChannelRecord,
  AdminLogRecord,
  AdminLogStatus,
} from "./admin-types";
import { errorMessage } from "./use-admin-resource";
import { AdminViewLayout } from "./view-layout";

const PAGE_SIZE = 100;

const STATUS_OPTIONS: Array<{ value: "" | AdminLogStatus; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "operational", label: "正常" },
  { value: "degraded", label: "降级" },
  { value: "failed", label: "失败" },
  { value: "validation_failed", label: "验证失败" },
  { value: "maintenance", label: "维护" },
  { value: "error", label: "错误" },
];

const STATUS_LABELS: Record<AdminLogStatus, string> = {
  operational: "正常",
  degraded: "降级",
  failed: "失败",
  validation_failed: "验证失败",
  maintenance: "维护",
  error: "错误",
};

const STATUS_VARIANTS: Record<
  AdminLogStatus,
  "success" | "warning" | "danger" | "secondary"
> = {
  operational: "success",
  degraded: "warning",
  failed: "danger",
  validation_failed: "danger",
  maintenance: "secondary",
  error: "danger",
};

export function LogsView() {
  const [logs, setLogs] = React.useState<AdminLogRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [channels, setChannels] = React.useState<AdminChannelRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<"" | AdminLogStatus>(
    ""
  );
  const [channelFilter, setChannelFilter] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [keyword, setKeyword] = React.useState("");
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    listAdminChannels()
      .then((records) => {
        if (!cancelled) {
          setChannels(records);
        }
      })
      .catch(() => {
        // 渠道筛选加载失败不影响日志列表本身。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminLogs({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        status: statusFilter || null,
        channelId: channelFilter || null,
        q: keyword || null,
      });
      setLogs(result.logs);
      setTotal(result.total);
    } catch (loadError) {
      setError(errorMessage(loadError));
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, channelFilter, keyword]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleStatusChange(value: string) {
    setStatusFilter(value as "" | AdminLogStatus);
    setPage(0);
  }

  function handleChannelChange(value: string) {
    setChannelFilter(value);
    setPage(0);
  }

  function handleSearch() {
    setKeyword(searchInput.trim());
    setPage(0);
  }

  return (
    <AdminViewLayout
      title="日志"
      description="查看最近的检测结果与上游响应日志"
    >
      <Card className="rounded-lg">
        <CardHeader className="p-4">
          <CardTitle className="text-base">筛选</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_160px_160px_auto_auto]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchInput}
              placeholder="搜索监控项、模型或日志内容"
              className="pl-9"
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSearch();
                }
              }}
            />
          </div>
          <Select
            value={statusFilter}
            aria-label="状态筛选"
            onChange={(event) => handleStatusChange(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            value={channelFilter}
            aria-label="渠道筛选"
            onChange={(event) => handleChannelChange(event.target.value)}
          >
            <option value="">全部渠道</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </Select>
          <Button type="button" onClick={handleSearch}>
            查询
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw
              className={cn("size-4", loading && "animate-spin")}
              aria-hidden="true"
            />
            刷新
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card className="rounded-lg">
        <CardHeader className="flex flex-row items-center justify-between gap-3 p-4">
          <CardTitle className="text-base">检测日志</CardTitle>
          <p className="text-xs text-muted-foreground">共 {total} 条</p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              正在加载日志
            </p>
          ) : null}
          {!loading && logs.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">暂无日志</p>
          ) : null}
          {!loading && logs.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">时间</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead>监控项</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="whitespace-nowrap">延迟</TableHead>
                    <TableHead>消息</TableHead>
                    <TableHead>日志</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatTime(log.checkedAtMs)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {log.channelName ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {log.name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {log.model}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[log.status]}>
                          {STATUS_LABELS[log.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {log.latencyMs !== null ? `${log.latencyMs}ms` : "—"}
                      </TableCell>
                      <TableCell
                        className="max-w-xs truncate text-xs"
                        title={log.message ?? undefined}
                      >
                        {log.message ?? "—"}
                      </TableCell>
                      <TableCell>
                        <LogDetails text={log.logMessage} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            第 {page + 1} / {pageCount} 页
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 0 || loading}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </Card>
    </AdminViewLayout>
  );
}

function LogDetails({ text }: { text: string | null }) {
  if (!text) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <details className="max-w-md">
      <summary className="cursor-pointer text-xs font-medium text-primary">
        查看
      </summary>
      <pre className="mt-2 max-h-48 max-w-md overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs">
        {text}
      </pre>
    </details>
  );
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
