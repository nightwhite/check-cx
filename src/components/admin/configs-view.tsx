import * as React from "react";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Select } from "../../../components/ui/select";
import {
  bulkCopyAdminConfigs,
  bulkDeleteAdminConfigs,
  bulkUpdateAdminConfigs,
  createAdminConfig,
  deleteAdminConfig,
  inheritAdminConfigSecret,
  listAdminChannels,
  listAdminConfigs,
  listAdminModels,
  replaceAdminConfigSecret,
  updateAdminConfig,
  type AdminBulkConfigPatch,
} from "./admin-api";
import type {
  AdminConfigRecord,
  AdminChannelRecord,
  AdminModelRecord,
} from "./admin-types";
import {
  BulkActionBar,
  BulkCopyConfigsDialog,
  BulkEditConfigsDialog,
} from "./bulk-actions";
import { ConfigForm, ConfigSecretDialog } from "./config-form";
import { DataTable } from "./data-table";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { errorMessage, includesText, useAdminResource } from "./use-admin-resource";
import { AdminViewLayout } from "./view-layout";

const KEY_SOURCE_LABEL: Record<AdminConfigRecord["keySource"], string> = {
  config: "独立 Key",
  channel: "继承渠道",
  none: "未配置",
};

function formatHost(value: string | null) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

function describeEndpoint(record: AdminConfigRecord) {
  if (!record.inheritsEndpoint) {
    return record.endpoint;
  }
  const host = formatHost(record.effectiveEndpoint);
  return host ? `继承 · ${host}` : "继承 · 渠道未配置 Base URL";
}

export function ConfigsView() {
  const [search, setSearch] = React.useState("");
  const [models, setModels] = React.useState<AdminModelRecord[]>([]);
  const [channels, setChannels] = React.useState<AdminChannelRecord[]>([]);
  const [editing, setEditing] = React.useState<AdminConfigRecord | null>(null);
  const [secretRecord, setSecretRecord] = React.useState<AdminConfigRecord | null>(
    null
  );
  const [deleting, setDeleting] = React.useState<AdminConfigRecord | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [catalogError, setCatalogError] = React.useState<string | null>(null);
  const [secretError, setSecretError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [channelFilter, setChannelFilter] = React.useState("all");
  const [stateFilter, setStateFilter] = React.useState("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = React.useState<
    "edit" | "copy" | "delete" | null
  >(null);
  const [bulkPending, setBulkPending] = React.useState(false);
  const [bulkError, setBulkError] = React.useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = React.useState<string | null>(null);
  const { records, setRecords, loading, error, reload } = useAdminResource({
    load: listAdminConfigs,
  });

  React.useEffect(() => {
    setCatalogError(null);
    Promise.all([listAdminModels(), listAdminChannels()])
      .then(([nextModels, nextChannels]) => {
        setModels(nextModels);
        setChannels(nextChannels);
      })
      .catch((loadError) => setCatalogError(errorMessage(loadError)));
  }, []);

  const filtered = records.filter(
    (record) =>
      includesText(
        [record.name, record.type, record.model, record.channelName, record.region],
        search
      ) &&
      (channelFilter === "all" ||
        (channelFilter === "none"
          ? !record.channelId
          : record.channelId === channelFilter)) &&
      (stateFilter === "all" ||
        (stateFilter === "enabled" && record.enabled) ||
        (stateFilter === "disabled" && !record.enabled) ||
        (stateFilter === "maintenance" && record.isMaintenance))
  );
  // 被删除或刷新后不存在的记录不再计入选择
  const selectedIds = records
    .filter((record) => selected.has(record.id))
    .map((record) => record.id);

  async function runBulk(
    action: () => Promise<string>,
    { closeDialog = true }: { closeDialog?: boolean } = {}
  ) {
    setBulkPending(true);
    setBulkError(null);
    setBulkNotice(null);
    try {
      const notice = await action();
      await reload();
      setSelected(new Set());
      setBulkNotice(notice);
      if (closeDialog) {
        setBulkDialog(null);
      }
    } catch (actionError) {
      setBulkError(errorMessage(actionError));
    } finally {
      setBulkPending(false);
    }
  }

  function bulkToggle(patch: AdminBulkConfigPatch, label: string) {
    return runBulk(async () => {
      const { updated } = await bulkUpdateAdminConfigs(selectedIds, patch);
      return `已${label} ${updated} 个监控项`;
    });
  }

  async function save(payload: Record<string, unknown>) {
    setSaving(true);
    setFormError(null);
    try {
      const saved = editing
        ? await updateAdminConfig(editing.id, payload)
        : await createAdminConfig(payload);
      setRecords((current) =>
        editing
          ? current.map((record) => (record.id === saved.id ? saved : record))
          : [saved, ...current]
      );
      setFormOpen(false);
    } catch (saveError) {
      setFormError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function replaceSecret(apiKey: string) {
    if (!secretRecord) {
      return;
    }
    setSaving(true);
    setSecretError(null);
    try {
      await replaceAdminConfigSecret(secretRecord.id, apiKey);
      setRecords((current) =>
        current.map((record) =>
          record.id === secretRecord.id
            ? { ...record, hasApiKey: true, keySource: "config" }
            : record
        )
      );
      setSecretRecord(null);
    } catch (replaceError) {
      setSecretError(errorMessage(replaceError));
    } finally {
      setSaving(false);
    }
  }

  async function inheritSecret() {
    if (!secretRecord) {
      return;
    }
    setSaving(true);
    setSecretError(null);
    try {
      await inheritAdminConfigSecret(secretRecord.id);
      setRecords((current) =>
        current.map((record) =>
          record.id === secretRecord.id
            ? { ...record, hasApiKey: false, keySource: "channel" }
            : record
        )
      );
      setSecretRecord(null);
    } catch (inheritError) {
      setSecretError(errorMessage(inheritError));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleting) {
      return;
    }
    setSaving(true);
    setDeleteError(null);
    try {
      await deleteAdminConfig(deleting.id);
      setRecords((current) => current.filter((record) => record.id !== deleting.id));
      setDeleting(null);
    } catch (removeError) {
      setDeleteError(errorMessage(removeError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminViewLayout
      title="监控项"
      description="维护渠道、模型、端点和检查频次，勾选后可批量操作"
      actionLabel="新增监控项"
      searchLabel="搜索监控项"
      searchValue={search}
      onSearchChange={setSearch}
      onCreate={() => {
        setEditing(null);
        setFormError(null);
        setFormOpen(true);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="按渠道筛选"
          value={channelFilter}
          className="h-9 w-auto min-w-[140px]"
          onChange={(event) => setChannelFilter(event.target.value)}
        >
          <option value="all">全部渠道</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
          <option value="none">未关联渠道</option>
        </Select>
        <Select
          aria-label="按状态筛选"
          value={stateFilter}
          className="h-9 w-auto min-w-[120px]"
          onChange={(event) => setStateFilter(event.target.value)}
        >
          <option value="all">全部状态</option>
          <option value="enabled">已启用</option>
          <option value="disabled">已停用</option>
          <option value="maintenance">维护中</option>
        </Select>
        <span className="text-xs text-muted-foreground">
          共 {filtered.length} 项
        </span>
      </div>
      <BulkActionBar
        count={selectedIds.length}
        pending={bulkPending}
        onClear={() => setSelected(new Set())}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => bulkToggle({ enabled: true }, "启用")}
        >
          启用
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => bulkToggle({ enabled: false }, "停用")}
        >
          停用
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setBulkError(null);
            setBulkDialog("edit");
          }}
        >
          批量修改
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setBulkError(null);
            setBulkDialog("copy");
          }}
        >
          复制到渠道
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => {
            setBulkError(null);
            setBulkDialog("delete");
          }}
        >
          删除
        </Button>
      </BulkActionBar>
      {bulkNotice ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {bulkNotice}
        </p>
      ) : null}
      {bulkError && !bulkDialog ? (
        <p role="alert" className="text-sm text-destructive">
          {bulkError}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">正在加载配置</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {catalogError ? (
        <p className="text-sm text-destructive">{catalogError}</p>
      ) : null}
      {!loading && !error ? (
        <DataTable
          records={filtered}
          getRowKey={(record) => record.id}
          selection={{
            selected,
            onChange: setSelected,
            getLabel: (record) =>
              `${record.channelName ?? "未关联渠道"} / ${record.name}`,
          }}
          emptyTitle="还没有监控项"
          emptyActionLabel="新增监控项"
          onCreate={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          columns={[
            {
              key: "name",
              header: "名称",
              cell: (record) => (
                <div>
                  <p className="font-medium">{record.name}</p>
                  <p
                    className="mt-1 max-w-[36ch] truncate text-xs text-muted-foreground"
                    title={record.effectiveEndpoint ?? undefined}
                  >
                    {describeEndpoint(record)}
                  </p>
                </div>
              ),
            },
            { key: "model", header: "模型", cell: (record) => record.model },
            {
              key: "apiFormat",
              header: "API",
              cell: (record) =>
                record.apiFormat === "responses" ? "Responses" : "Chat",
            },
            {
              key: "channel",
              header: "渠道",
              cell: (record) => record.channelName ?? "未配置",
            },
            {
              key: "frequency",
              header: "频次",
              cell: (record) =>
                record.checkIntervalSeconds
                  ? `${record.checkIntervalSeconds} 秒`
                  : "默认",
            },
            {
              key: "region",
              header: "Region",
              cell: (record) => record.region ?? "未配置",
            },
            {
              key: "type",
              header: "Provider",
              cell: (record) => <Badge variant="secondary">{record.type}</Badge>,
            },
            {
              key: "key",
              header: "Key",
              cell: (record) => KEY_SOURCE_LABEL[record.keySource] ?? "未配置",
            },
            {
              key: "state",
              header: "状态",
              cell: (record) => (
                <div className="flex flex-wrap gap-1">
                  <Badge variant={record.enabled ? "success" : "outline"}>
                    {record.enabled ? "启用" : "停用"}
                  </Badge>
                  {record.isMaintenance ? (
                    <Badge variant="warning">维护中</Badge>
                  ) : null}
                </div>
              ),
            },
            {
              key: "actions",
              header: "操作",
              className: "text-right",
              cell: (record) => (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(record);
                      setFormError(null);
                      setFormOpen(true);
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSecretError(null);
                      setSecretRecord(record);
                    }}
                  >
                    替换 Key
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleting(record)}
                  >
                    删除
                  </Button>
                </div>
              ),
            },
          ]}
        />
      ) : null}
      <ConfigForm
        open={formOpen}
        record={editing}
        models={models}
        channels={channels}
        saving={saving}
        serverError={formError}
        onOpenChange={setFormOpen}
        onSubmit={save}
      />
      <ConfigSecretDialog
        open={Boolean(secretRecord)}
        configName={secretRecord?.name ?? ""}
        keySource={secretRecord?.keySource}
        channelHasApiKey={
          channels.find((channel) => channel.id === secretRecord?.channelId)
            ?.hasApiKey ?? false
        }
        saving={saving}
        serverError={secretError}
        onOpenChange={(open) => {
          if (!open) {
            setSecretRecord(null);
            setSecretError(null);
          }
        }}
        onSubmit={replaceSecret}
        onInherit={inheritSecret}
      />
      <BulkEditConfigsDialog
        open={bulkDialog === "edit"}
        count={selectedIds.length}
        channels={channels}
        saving={bulkPending}
        serverError={bulkDialog === "edit" ? bulkError : null}
        onOpenChange={(open) => setBulkDialog(open ? "edit" : null)}
        onSubmit={(patch) =>
          runBulk(async () => {
            const { updated } = await bulkUpdateAdminConfigs(selectedIds, patch);
            return `已修改 ${updated} 个监控项`;
          })
        }
      />
      <BulkCopyConfigsDialog
        open={bulkDialog === "copy"}
        count={selectedIds.length}
        channels={channels}
        saving={bulkPending}
        serverError={bulkDialog === "copy" ? bulkError : null}
        onOpenChange={(open) => setBulkDialog(open ? "copy" : null)}
        onSubmit={(channelId) =>
          runBulk(async () => {
            const { created, skipped } = await bulkCopyAdminConfigs(
              selectedIds,
              channelId
            );
            return `已复制 ${created} 个监控项${skipped > 0 ? `，${skipped} 个已存在跳过` : ""}`;
          })
        }
      />
      <DeleteConfirmDialog
        open={bulkDialog === "delete"}
        title={`删除 ${selectedIds.length} 个监控项`}
        description="监控项及其检测历史会一并删除，无法恢复"
        pending={bulkPending}
        error={bulkDialog === "delete" ? bulkError : null}
        onOpenChange={(open) => setBulkDialog(open ? "delete" : null)}
        onConfirm={() =>
          runBulk(async () => {
            const { deleted } = await bulkDeleteAdminConfigs(selectedIds);
            return `已删除 ${deleted} 个监控项`;
          })
        }
      />
      <DeleteConfirmDialog
        open={Boolean(deleting)}
        title="删除配置"
        description={deleting?.name ?? ""}
        pending={saving}
        error={deleteError}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeleteError(null);
          }
        }}
        onConfirm={remove}
      />
    </AdminViewLayout>
  );
}
