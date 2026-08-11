import * as React from "react";

import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { Field, TextInput } from "./form-fields";
import type { AdminChannelRecord } from "./admin-types";

interface ChannelFormProps {
  open: boolean;
  record: AdminChannelRecord | null;
  saving: boolean;
  serverError: string | null;
  onOpenChange(open: boolean): void;
  onSubmit(payload: Record<string, unknown>): void;
}

export function ChannelForm({
  open,
  record,
  saving,
  serverError,
  onOpenChange,
  onSubmit,
}: ChannelFormProps) {
  const [name, setName] = React.useState("");
  const [logoUrl, setLogoUrl] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [statusPageUrl, setStatusPageUrl] = React.useState("");
  const [sortOrder, setSortOrder] = React.useState("0");
  const [enabled, setEnabled] = React.useState(true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setName(record?.name ?? "");
    setLogoUrl(record?.logoUrl ?? "");
    setWebsiteUrl(record?.websiteUrl ?? "");
    setStatusPageUrl(record?.statusPageUrl ?? "");
    setSortOrder(String(record?.sortOrder ?? 0));
    setEnabled(record?.enabled ?? true);
    setErrors({});
  }, [open, record]);

  function handleSubmit() {
    const nextErrors: Record<string, string> = {};
    const parsedSortOrder = Number(sortOrder);
    if (!name.trim()) {
      nextErrors.name = "渠道名称必填";
    }
    if (!Number.isInteger(parsedSortOrder)) {
      nextErrors.sortOrder = "排序必须是整数";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit({
      name,
      logoUrl: logoUrl || null,
      websiteUrl: websiteUrl || null,
      statusPageUrl: statusPageUrl || null,
      sortOrder: parsedSortOrder,
      enabled,
    });
  }

  return (
    <Dialog
      open={open}
      title={record ? "编辑渠道" : "新增渠道"}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={saving} onClick={handleSubmit}>
            保存渠道
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="渠道名称" error={errors.name}>
          <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Logo URL">
          <TextInput
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="官网链接">
            <TextInput
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
            />
          </Field>
          <Field label="官方状态页链接">
            <TextInput
              value={statusPageUrl}
              onChange={(event) => setStatusPageUrl(event.target.value)}
            />
          </Field>
        </div>
        <Field label="排序" error={errors.sortOrder}>
          <TextInput
            type="number"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          启用
        </label>
        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      </div>
    </Dialog>
  );
}
