import * as React from "react";

import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { Select } from "../../../components/ui/select";
import { Field, ProviderSelect, TextInput } from "./form-fields";
import type {
  AdminModelRecord,
  AdminProviderType,
  AdminTemplateRecord,
} from "./admin-types";

interface ModelFormProps {
  open: boolean;
  record: AdminModelRecord | null;
  templates: AdminTemplateRecord[];
  saving: boolean;
  serverError: string | null;
  onOpenChange(open: boolean): void;
  onSubmit(payload: Record<string, unknown>): void;
}

export function ModelForm({
  open,
  record,
  templates,
  saving,
  serverError,
  onOpenChange,
  onSubmit,
}: ModelFormProps) {
  const [type, setType] = React.useState<AdminProviderType>("openai");
  const [model, setModel] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setType(record?.type ?? "openai");
    setModel(record?.model ?? "");
    setTemplateId(record?.templateId ?? "");
    setErrors({});
  }, [open, record]);

  function handleSubmit() {
    const nextErrors: Record<string, string> = {};
    if (!model.trim()) {
      nextErrors.model = "模型名称必填";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    onSubmit({
      type,
      model,
      templateId: templateId || null,
    });
  }

  return (
    <Dialog
      open={open}
      title={record ? "编辑模型" : "新增模型"}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={saving} onClick={handleSubmit}>
            保存模型
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Provider 类型">
          <ProviderSelect value={type} onChange={setType} />
        </Field>
        <Field label="模型名称" error={errors.model}>
          <TextInput value={model} onChange={(event) => setModel(event.target.value)} />
        </Field>
        <Field label="请求模板">
          <Select
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            <option value="">不绑定</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
        </Field>
        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      </div>
    </Dialog>
  );
}
