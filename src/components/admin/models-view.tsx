import * as React from "react";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  createAdminModel,
  deleteAdminModel,
  listAdminModels,
  listAdminTemplates,
  updateAdminModel,
} from "./admin-api";
import type { AdminModelRecord, AdminTemplateRecord } from "./admin-types";
import { DataTable } from "./data-table";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { ModelForm } from "./model-form";
import { errorMessage, includesText, useAdminResource } from "./use-admin-resource";
import { AdminViewLayout } from "./view-layout";

export function ModelsView() {
  const [search, setSearch] = React.useState("");
  const [templates, setTemplates] = React.useState<AdminTemplateRecord[]>([]);
  const [editing, setEditing] = React.useState<AdminModelRecord | null>(null);
  const [deleting, setDeleting] = React.useState<AdminModelRecord | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [templateError, setTemplateError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const { records, setRecords, loading, error } = useAdminResource({
    load: listAdminModels,
  });

  React.useEffect(() => {
    setTemplateError(null);
    listAdminTemplates()
      .then(setTemplates)
      .catch((loadError) => setTemplateError(errorMessage(loadError)));
  }, []);

  const filtered = records.filter((record) =>
    includesText([record.model, record.type, record.templateName], search)
  );

  async function save(payload: Record<string, unknown>) {
    setSaving(true);
    setFormError(null);
    try {
      const saved = editing
        ? await updateAdminModel(editing.id, payload)
        : await createAdminModel(payload);
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
      await deleteAdminModel(deleting.id);
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
      title="模型"
      description="维护 Provider 模型与模板绑定"
      actionLabel="新增模型"
      searchLabel="搜索模型"
      searchValue={search}
      onSearchChange={setSearch}
      onCreate={() => {
        setEditing(null);
        setFormError(null);
        setFormOpen(true);
      }}
    >
      {loading ? <p className="text-sm text-muted-foreground">正在加载模型</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {templateError ? (
        <p className="text-sm text-destructive">{templateError}</p>
      ) : null}
      {!loading && !error ? (
        <DataTable
          records={filtered}
          getRowKey={(record) => record.id}
          emptyTitle="还没有模型"
          emptyActionLabel="新增模型"
          onCreate={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          columns={[
            { key: "model", header: "模型", cell: (record) => record.model },
            {
              key: "type",
              header: "Provider",
              cell: (record) => <Badge variant="secondary">{record.type}</Badge>,
            },
            {
              key: "template",
              header: "模板",
              cell: (record) => record.templateName ?? "未绑定",
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
      <ModelForm
        open={formOpen}
        record={editing}
        templates={templates}
        saving={saving}
        serverError={formError}
        onOpenChange={setFormOpen}
        onSubmit={save}
      />
      <DeleteConfirmDialog
        open={Boolean(deleting)}
        title="删除模型"
        description={deleting?.model ?? ""}
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
