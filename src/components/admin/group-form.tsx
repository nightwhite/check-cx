import * as React from "react";

import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { Field, TextInput } from "./form-fields";
import type { AdminGroupRecord } from "./admin-types";

interface GroupFormProps {
  open: boolean;
  record: AdminGroupRecord | null;
  saving: boolean;
  serverError: string | null;
  onOpenChange(open: boolean): void;
  onSubmit(payload: Record<string, unknown>): void;
}

export function GroupForm({
  open,
  record,
  saving,
  serverError,
  onOpenChange,
  onSubmit,
}: GroupFormProps) {
  const [groupName, setGroupName] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setGroupName(record?.groupName ?? "");
    setWebsiteUrl(record?.websiteUrl ?? "");
    setTags(record?.tags ?? "");
    setErrors({});
  }, [open, record]);

  function handleSubmit() {
    const nextErrors: Record<string, string> = {};
    if (!groupName.trim()) {
      nextErrors.groupName = "分组名称必填";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    onSubmit({
      groupName,
      websiteUrl: websiteUrl || null,
      tags,
    });
  }

  return (
    <Dialog
      open={open}
      title={record ? "编辑分组" : "新增分组"}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={saving} onClick={handleSubmit}>
            保存分组
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="分组名称" error={errors.groupName}>
          <TextInput
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
          />
        </Field>
        <Field label="官网地址">
          <TextInput
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
          />
        </Field>
        <Field label="标签">
          <TextInput value={tags} onChange={(event) => setTags(event.target.value)} />
        </Field>
        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      </div>
    </Dialog>
  );
}
