import * as React from "react";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  createAdminTemplate,
  deleteAdminTemplate,
  listAdminTemplates,
  updateAdminTemplate,
} from "./admin-api";
import type { AdminTemplateRecord } from "./admin-types";
import { DataTable } from "./data-table";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { TemplateForm } from "./template-form";
import { errorMessage, includesText, useAdminResource } from "./use-admin-resource";
import { AdminViewLayout } from "./view-layout";

export function TemplatesView() {
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<AdminTemplateRecord | null>(null);
  const [deleting, setDeleting] = React.useState<AdminTemplateRecord | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const { records, setRecords, loading, error } = useAdminResource({
    load: listAdminTemplates,
  });

  const filtered = records.filter((record) =>
    includesText([record.name, record.type], search)
  );

  async function save(payload: Record<string, unknown>) {
    setSaving(true);
    setFormError(null);
    try {
      const saved = editing
        ? await updateAdminTemplate(editing.id, payload)
        : await createAdminTemplate(payload);
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
      await deleteAdminTemplate(deleting.id);
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
      title="请求模板"
      description="维护 Provider 请求头与 metadata"
      actionLabel="新增模板"
      searchLabel="搜索模板"
      searchValue={search}
      onSearchChange={setSearch}
      onCreate={() => {
        setEditing(null);
        setFormError(null);
        setFormOpen(true);
      }}
    >
      {loading ? <p className="text-sm text-muted-foreground">正在加载模板</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!loading && !error ? (
        <DataTable
          records={filtered}
          getRowKey={(record) => record.id}
          emptyTitle="还没有模板"
          emptyActionLabel="新增模板"
          onCreate={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          columns={[
            { key: "name", header: "名称", cell: (record) => record.name },
            {
              key: "type",
              header: "Provider",
              cell: (record) => <Badge variant="secondary">{record.type}</Badge>,
            },
            {
              key: "header",
              header: "请求头",
              cell: (record) => (record.requestHeader ? "已配置" : "未配置"),
            },
            {
              key: "metadata",
              header: "Metadata",
              cell: (record) => (record.metadata ? "已配置" : "未配置"),
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
      <TemplateForm
        open={formOpen}
        record={editing}
        saving={saving}
        serverError={formError}
        onOpenChange={setFormOpen}
        onSubmit={save}
      />
      <DeleteConfirmDialog
        open={Boolean(deleting)}
        title="删除模板"
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
