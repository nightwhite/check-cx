import * as React from "react";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  bulkDeleteAdminModels,
  createAdminModel,
  deleteAdminModel,
  listAdminModels,
  listAdminTemplates,
  updateAdminModel,
} from "./admin-api";
import type { AdminModelRecord, AdminTemplateRecord } from "./admin-types";
import { BulkActionBar } from "./bulk-actions";
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
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [bulkPending, setBulkPending] = React.useState(false);
  const [bulkError, setBulkError] = React.useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = React.useState<string | null>(null);
  const { records, setRecords, loading, error, reload } = useAdminResource({
    load: listAdminModels,
  });
  const selectedIds = records
    .filter((record) => selected.has(record.id))
    .map((record) => record.id);

  async function bulkRemove() {
    setBulkPending(true);
    setBulkError(null);
    setBulkNotice(null);
    try {
      const { deleted, skippedInUse } = await bulkDeleteAdminModels(selectedIds);
      const skippedNames = records
        .filter((record) => skippedInUse.includes(record.id))
        .map((record) => record.model);
      await reload();
      // 仍被引用而跳过的模型保持勾选，方便去处理对应监控项
      setSelected(new Set(skippedInUse));
      setBulkDeleteOpen(false);
      setBulkNotice(
        `已删除 ${deleted} 个模型${
          skippedNames.length > 0
            ? `；${skippedNames.length} 个仍被监控项引用未删除：${skippedNames
                .slice(0, 5)
                .join("、")}${skippedNames.length > 5 ? " 等" : ""}`
            : ""
        }`
      );
    } catch (removeError) {
      setBulkError(errorMessage(removeError));
    } finally {
      setBulkPending(false);
    }
  }

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
      <BulkActionBar
        count={selectedIds.length}
        pending={bulkPending}
        onClear={() => setSelected(new Set())}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => {
            setBulkError(null);
            setBulkDeleteOpen(true);
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
      {loading ? <p className="text-sm text-muted-foreground">正在加载模型</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {templateError ? (
        <p className="text-sm text-destructive">{templateError}</p>
      ) : null}
      {!loading && !error ? (
        <DataTable
          records={filtered}
          getRowKey={(record) => record.id}
          selection={{
            selected,
            onChange: setSelected,
            getLabel: (record) => record.model,
          }}
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
        open={bulkDeleteOpen}
        title={`删除 ${selectedIds.length} 个模型`}
        description="仍被监控项引用的模型会跳过，不会删除"
        pending={bulkPending}
        error={bulkError}
        onOpenChange={setBulkDeleteOpen}
        onConfirm={bulkRemove}
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
