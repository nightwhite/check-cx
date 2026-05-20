import * as React from "react";

import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { Select } from "../../../components/ui/select";
import { Field, ProviderSelect, TextInput } from "./form-fields";
import type {
  AdminConfigRecord,
  AdminGroupRecord,
  AdminModelRecord,
  AdminProviderType,
} from "./admin-types";

interface ConfigFormProps {
  open: boolean;
  record: AdminConfigRecord | null;
  models: AdminModelRecord[];
  groups: AdminGroupRecord[];
  saving: boolean;
  serverError: string | null;
  onOpenChange(open: boolean): void;
  onSubmit(payload: Record<string, unknown>): void;
}

export function ConfigForm({
  open,
  record,
  models,
  groups,
  saving,
  serverError,
  onOpenChange,
  onSubmit,
}: ConfigFormProps) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AdminProviderType>("openai");
  const [modelId, setModelId] = React.useState("");
  const [endpoint, setEndpoint] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [groupName, setGroupName] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);
  const [isMaintenance, setIsMaintenance] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setName(record?.name ?? "");
    setType(record?.type ?? "openai");
    setModelId(record?.modelId ?? "");
    setEndpoint(record?.endpoint ?? "");
    setApiKey("");
    setGroupName(record?.groupName ?? "");
    setEnabled(record?.enabled ?? true);
    setIsMaintenance(record?.isMaintenance ?? false);
    setErrors({});
  }, [open, record]);

  function handleSubmit() {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) {
      nextErrors.name = "配置名称必填";
    }
    if (!modelId) {
      nextErrors.modelId = "模型必选";
    }
    if (!endpoint.trim()) {
      nextErrors.endpoint = "API 端点必填";
    }
    if (!record && !apiKey.trim()) {
      nextErrors.apiKey = "API Key 必填";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    const payload: Record<string, unknown> = {
      name,
      type,
      modelId,
      endpoint,
      enabled,
      isMaintenance,
      groupName: groupName || null,
    };
    if (!record) {
      payload.apiKey = apiKey;
    }
    onSubmit(payload);
  }

  return (
    <Dialog
      open={open}
      title={record ? "编辑 Provider 配置" : "新增 Provider 配置"}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={saving} onClick={handleSubmit}>
            保存配置
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="配置名称" error={errors.name}>
          <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider 类型">
            <ProviderSelect value={type} onChange={setType} />
          </Field>
          <Field label="模型" error={errors.modelId}>
            <Select
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
            >
              <option value="">选择模型</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.model}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="API 端点" error={errors.endpoint}>
          <TextInput
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
          />
        </Field>
        {!record ? (
          <Field label="API Key" error={errors.apiKey}>
            <TextInput
              type="password"
              value={apiKey}
              autoComplete="new-password"
              onChange={(event) => setApiKey(event.target.value)}
            />
          </Field>
        ) : null}
        <Field label="分组">
          <Select
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
          >
            <option value="">不分组</option>
            {groups.map((group) => (
              <option key={group.id} value={group.groupName}>
                {group.groupName}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            启用
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isMaintenance}
              onChange={(event) => setIsMaintenance(event.target.checked)}
            />
            维护中
          </label>
        </div>
        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      </div>
    </Dialog>
  );
}

interface ConfigSecretDialogProps {
  open: boolean;
  configName: string;
  saving: boolean;
  serverError: string | null;
  onOpenChange(open: boolean): void;
  onSubmit(apiKey: string): void;
}

export function ConfigSecretDialog({
  open,
  configName,
  saving,
  serverError,
  onOpenChange,
  onSubmit,
}: ConfigSecretDialogProps) {
  const [apiKey, setApiKey] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setApiKey("");
      setError(null);
    }
  }, [open]);

  function handleSubmit() {
    if (!apiKey.trim()) {
      setError("新 API Key 必填");
      return;
    }
    onSubmit(apiKey);
  }

  return (
    <Dialog
      open={open}
      title="替换 API Key"
      description={configName}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={saving} onClick={handleSubmit}>
            确认替换
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="新 API Key" error={error ?? undefined}>
          <TextInput
            type="password"
            value={apiKey}
            autoComplete="new-password"
            onChange={(event) => setApiKey(event.target.value)}
          />
        </Field>
        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      </div>
    </Dialog>
  );
}
