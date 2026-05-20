import * as React from "react";

import { Button } from "../../../components/ui/button";
import {
  createAdminGroup,
  deleteAdminGroup,
  listAdminGroups,
  updateAdminGroup,
} from "./admin-api";
import type { AdminGroupRecord } from "./admin-types";
import { DataTable } from "./data-table";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { GroupForm } from "./group-form";
import { errorMessage, includesText, useAdminResource } from "./use-admin-resource";
import { AdminViewLayout } from "./view-layout";

export function GroupsView() {
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<AdminGroupRecord | null>(null);
  const [deleting, setDeleting] = React.useState<AdminGroupRecord | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const { records, setRecords, loading, error } = useAdminResource({
    load: listAdminGroups,
  });

  const filtered = records.filter((record) =>
    includesText([record.groupName, record.websiteUrl, record.tags], search)
  );

  async function save(payload: Record<string, unknown>) {
    setSaving(true);
    setFormError(null);
    try {
      const saved = editing
        ? await updateAdminGroup(editing.id, payload)
        : await createAdminGroup(payload);
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
      await deleteAdminGroup(deleting.id);
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
      title="分组"
      description="维护 Provider 分组与站点链接"
      actionLabel="新增分组"
      searchLabel="搜索分组"
      searchValue={search}
      onSearchChange={setSearch}
      onCreate={() => {
        setEditing(null);
        setFormError(null);
        setFormOpen(true);
      }}
    >
      {loading ? <p className="text-sm text-muted-foreground">正在加载分组</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!loading && !error ? (
        <DataTable
          records={filtered}
          getRowKey={(record) => record.id}
          emptyTitle="还没有分组"
          emptyActionLabel="新增分组"
          onCreate={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          columns={[
            { key: "name", header: "名称", cell: (record) => record.groupName },
            {
              key: "url",
              header: "官网",
              cell: (record) => record.websiteUrl ?? "未配置",
            },
            { key: "tags", header: "标签", cell: (record) => record.tags || "无" },
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
      <GroupForm
        open={formOpen}
        record={editing}
        saving={saving}
        serverError={formError}
        onOpenChange={setFormOpen}
        onSubmit={save}
      />
      <DeleteConfirmDialog
        open={Boolean(deleting)}
        title="删除分组"
        description={deleting?.groupName ?? ""}
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
