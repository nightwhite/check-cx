import * as React from "react";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  createAdminConfig,
  deleteAdminConfig,
  listAdminConfigs,
  listAdminGroups,
  listAdminModels,
  replaceAdminConfigSecret,
  updateAdminConfig,
} from "./admin-api";
import type {
  AdminConfigRecord,
  AdminGroupRecord,
  AdminModelRecord,
} from "./admin-types";
import { ConfigForm, ConfigSecretDialog } from "./config-form";
import { DataTable } from "./data-table";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { errorMessage, includesText, useAdminResource } from "./use-admin-resource";
import { AdminViewLayout } from "./view-layout";

export function ConfigsView() {
  const [search, setSearch] = React.useState("");
  const [models, setModels] = React.useState<AdminModelRecord[]>([]);
  const [groups, setGroups] = React.useState<AdminGroupRecord[]>([]);
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
  const { records, setRecords, loading, error } = useAdminResource({
    load: listAdminConfigs,
  });

  React.useEffect(() => {
    setCatalogError(null);
    Promise.all([listAdminModels(), listAdminGroups()])
      .then(([nextModels, nextGroups]) => {
        setModels(nextModels);
        setGroups(nextGroups);
      })
      .catch((loadError) => setCatalogError(errorMessage(loadError)));
  }, []);

  const filtered = records.filter((record) =>
    includesText([record.name, record.type, record.model, record.groupName], search)
  );

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
          record.id === secretRecord.id ? { ...record, hasApiKey: true } : record
        )
      );
      setSecretRecord(null);
    } catch (replaceError) {
      setSecretError(errorMessage(replaceError));
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
      title="Provider 配置"
      description="维护检测实例、端点和密钥状态"
      actionLabel="新增配置"
      searchLabel="搜索配置"
      searchValue={search}
      onSearchChange={setSearch}
      onCreate={() => {
        setEditing(null);
        setFormError(null);
        setFormOpen(true);
      }}
    >
      {loading ? <p className="text-sm text-muted-foreground">正在加载配置</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {catalogError ? (
        <p className="text-sm text-destructive">{catalogError}</p>
      ) : null}
      {!loading && !error ? (
        <DataTable
          records={filtered}
          getRowKey={(record) => record.id}
          emptyTitle="还没有 Provider 配置"
          emptyActionLabel="新增配置"
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
                  <p className="mt-1 max-w-[36ch] truncate text-xs text-muted-foreground">
                    {record.endpoint}
                  </p>
                </div>
              ),
            },
            { key: "model", header: "模型", cell: (record) => record.model },
            {
              key: "type",
              header: "Provider",
              cell: (record) => <Badge variant="secondary">{record.type}</Badge>,
            },
            {
              key: "group",
              header: "分组",
              cell: (record) => record.groupName ?? "未分组",
            },
            {
              key: "key",
              header: "Key",
              cell: (record) => (record.hasApiKey ? "已配置" : "未配置"),
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
        groups={groups}
        saving={saving}
        serverError={formError}
        onOpenChange={setFormOpen}
        onSubmit={save}
      />
      <ConfigSecretDialog
        open={Boolean(secretRecord)}
        configName={secretRecord?.name ?? ""}
        saving={saving}
        serverError={secretError}
        onOpenChange={(open) => {
          if (!open) {
            setSecretRecord(null);
            setSecretError(null);
          }
        }}
        onSubmit={replaceSecret}
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
