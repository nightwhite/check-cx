import * as React from "react";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  createAdminChannel,
  deleteAdminChannel,
  listAdminChannels,
  updateAdminChannel,
} from "./admin-api";
import type { AdminChannelRecord } from "./admin-types";
import { ChannelForm } from "./channel-form";
import { DataTable } from "./data-table";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { errorMessage, includesText, useAdminResource } from "./use-admin-resource";
import { AdminViewLayout } from "./view-layout";

export function ChannelsView() {
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<AdminChannelRecord | null>(null);
  const [deleting, setDeleting] = React.useState<AdminChannelRecord | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const { records, setRecords, loading, error } = useAdminResource({
    load: listAdminChannels,
  });

  const filtered = records.filter((record) =>
    includesText([record.name, record.websiteUrl, record.statusPageUrl], search)
  );

  async function save(payload: Record<string, unknown>) {
    setSaving(true);
    setFormError(null);
    try {
      const saved = editing
        ? await updateAdminChannel(editing.id, payload)
        : await createAdminChannel(payload);
      setRecords((current) =>
        editing
          ? current.map((record) => (record.id === saved.id ? saved : record))
          : [...current, saved].sort(
              (left, right) =>
                left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)
            )
      );
      setFormOpen(false);
    } catch (saveError) {
      setFormError(errorMessage(saveError));
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
      await deleteAdminChannel(deleting.id);
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
      title="渠道"
      description="维护模型监控来源与官方状态页链接"
      actionLabel="新增渠道"
      searchLabel="搜索渠道"
      searchValue={search}
      onSearchChange={setSearch}
      onCreate={() => {
        setEditing(null);
        setFormError(null);
        setFormOpen(true);
      }}
    >
      {loading ? <p className="text-sm text-muted-foreground">正在加载渠道</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!loading && !error ? (
        <DataTable
          records={filtered}
          getRowKey={(record) => record.id}
          emptyTitle="还没有渠道"
          emptyActionLabel="新增渠道"
          onCreate={() => {
            setEditing(null);
            setFormError(null);
            setFormOpen(true);
          }}
          columns={[
            { key: "name", header: "渠道", cell: (record) => record.name },
            {
              key: "website",
              header: "官网",
              cell: (record) => record.websiteUrl ?? "未配置",
            },
            {
              key: "status",
              header: "状态页",
              cell: (record) => record.statusPageUrl ?? "未配置",
            },
            { key: "sort", header: "排序", cell: (record) => record.sortOrder },
            {
              key: "enabled",
              header: "状态",
              cell: (record) => (
                <Badge variant={record.enabled ? "secondary" : "outline"}>
                  {record.enabled ? "启用" : "停用"}
                </Badge>
              ),
            },
            {
              key: "actions",
              header: "操作",
              className: "text-right",
              cell: (record) => (
                <div className="flex justify-end gap-2">
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
      <ChannelForm
        open={formOpen}
        record={editing}
        saving={saving}
        serverError={formError}
        onOpenChange={setFormOpen}
        onSubmit={save}
      />
      <DeleteConfirmDialog
        open={Boolean(deleting)}
        title="删除渠道"
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
