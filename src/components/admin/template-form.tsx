import * as React from "react";

import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { Field, JsonTextarea, ProviderSelect, TextInput } from "./form-fields";
import type { AdminProviderType, AdminTemplateRecord } from "./admin-types";

interface TemplateFormProps {
  open: boolean;
  record: AdminTemplateRecord | null;
  saving: boolean;
  serverError: string | null;
  onOpenChange(open: boolean): void;
  onSubmit(payload: Record<string, unknown>): void;
}

export function TemplateForm({
  open,
  record,
  saving,
  serverError,
  onOpenChange,
  onSubmit,
}: TemplateFormProps) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AdminProviderType>("openai");
  const [requestHeader, setRequestHeader] = React.useState("");
  const [metadata, setMetadata] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setName(record?.name ?? "");
    setType(record?.type ?? "openai");
    setRequestHeader(jsonText(record?.requestHeader));
    setMetadata(jsonText(record?.metadata));
    setErrors({});
  }, [open, record]);

  function handleSubmit() {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) {
      nextErrors.name = "模板名称必填";
    }
    const requestHeaderValue = parseJsonField(requestHeader, "请求头", nextErrors);
    const metadataValue = parseJsonField(metadata, "Metadata", nextErrors);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    onSubmit({
      name,
      type,
      requestHeader: requestHeaderValue,
      metadata: metadataValue,
    });
  }

  return (
    <Dialog
      open={open}
      title={record ? "编辑模板" : "新增模板"}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={saving} onClick={handleSubmit}>
            保存模板
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="模板名称" error={errors.name}>
          <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Provider 类型">
          <ProviderSelect value={type} onChange={setType} />
        </Field>
        <Field label="请求头" error={errors.requestHeader}>
          <JsonTextarea
            value={requestHeader}
            placeholder='{"x-custom":"1"}'
            onChange={(event) => setRequestHeader(event.target.value)}
          />
        </Field>
        <Field label="Metadata" error={errors.metadata}>
          <JsonTextarea
            value={metadata}
            placeholder='{"temperature":0}'
            onChange={(event) => setMetadata(event.target.value)}
          />
        </Field>
        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      </div>
    </Dialog>
  );
}

function jsonText(value: Record<string, unknown> | null | undefined): string {
  return value ? JSON.stringify(value, null, 2) : "";
}

function parseJsonField(
  value: string,
  label: string,
  errors: Record<string, string>
): Record<string, unknown> | null {
  const text = value.trim();
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors[label === "请求头" ? "requestHeader" : "metadata"] = `${label} 必须是 JSON object`;
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    errors[label === "请求头" ? "requestHeader" : "metadata"] = `${label} 必须是有效 JSON`;
    return null;
  }
}
