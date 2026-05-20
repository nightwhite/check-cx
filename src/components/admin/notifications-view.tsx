import * as React from "react";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  createAdminNotification,
  deleteAdminNotification,
  listAdminNotifications,
  updateAdminNotification,
} from "./admin-api";
import type { AdminNotificationRecord } from "./admin-types";
import { DataTable } from "./data-table";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { NotificationForm } from "./notification-form";
import { errorMessage, includesText, useAdminResource } from "./use-admin-resource";
import { AdminViewLayout } from "./view-layout";

export function NotificationsView() {
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<AdminNotificationRecord | null>(
    null
  );
  const [deleting, setDeleting] = React.useState<AdminNotificationRecord | null>(
    null
  );
  const [formOpen, setFormOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const { records, setRecords, loading, error } = useAdminResource({
    load: listAdminNotifications,
  });

  const filtered = records.filter((record) =>
    includesText([record.message, record.level], search)
  );

  async function save(payload: Record<string, unknown>) {
    setSaving(true);
    setFormError(null);
    try {
      const saved = editing
        ? await updateAdminNotification(editing.id, payload)
        : await createAdminNotification(payload);
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

  async function remove() {
    if (!deleting) {
      return;
    }
    setSaving(true);
    setDeleteError(null);
    try {
      await deleteAdminNotification(deleting.id);
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
      title="通知"
      description="维护状态页通知横幅"
      actionLabel="新增通知"
      searchLabel="搜索通知"
      searchValue={search}
      onSearchChange={setSearch}
      onCreate={() => {
        setEditing(null);
        setFormError(null);
        setFormOpen(true);
      }}
    >
      {loading ? <p className="text-sm text-muted-foreground">正在加载通知</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!loading && !error ? (
        <DataTable
          records={filtered}
          getRowKey={(record) => record.id}
          emptyTitle="还没有通知"
          emptyActionLabel="新增通知"
          onCreate={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          columns={[
            {
              key: "message",
              header: "内容",
              cell: (record) => (
                <p className="max-w-[52ch] truncate">{record.message}</p>
              ),
            },
            {
              key: "level",
              header: "级别",
              cell: (record) => (
                <Badge
                  variant={
                    record.level === "error"
                      ? "danger"
                      : record.level === "warning"
                        ? "warning"
                        : "secondary"
                  }
                >
                  {levelLabel(record.level)}
                </Badge>
              ),
            },
            {
              key: "active",
              header: "状态",
              cell: (record) => (record.isActive ? "显示" : "隐藏"),
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
      <NotificationForm
        open={formOpen}
        record={editing}
        saving={saving}
        serverError={formError}
        onOpenChange={setFormOpen}
        onSubmit={save}
      />
      <DeleteConfirmDialog
        open={Boolean(deleting)}
        title="删除通知"
        description={deleting?.message ?? ""}
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

function levelLabel(level: AdminNotificationRecord["level"]) {
  if (level === "warning") {
    return "警告";
  }
  if (level === "error") {
    return "异常";
  }
  return "信息";
}
