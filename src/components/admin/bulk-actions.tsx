import * as React from "react";

import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { Select } from "../../../components/ui/select";
import type { AdminBulkConfigPatch } from "./admin-api";
import type { AdminChannelRecord } from "./admin-types";
import { Field, TextInput } from "./form-fields";

// 列表上方的批量操作栏：有勾选时才出现
export function BulkActionBar({
  count,
  pending,
  children,
  onClear,
}: {
  count: number;
  pending: boolean;
  children: React.ReactNode;
  onClear(): void;
}) {
  if (count === 0) {
    return null;
  }
  return (
    <div
      role="toolbar"
      aria-label="批量操作"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm"
    >
      <span className="mr-1 text-sm font-medium">已选 {count} 项</span>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto"
        onClick={onClear}
      >
        取消选择
      </Button>
    </div>
  );
}

type FieldKey = "channelId" | "apiFormat" | "checkIntervalSeconds" | "isMaintenance";

const FIELD_LABEL: Record<FieldKey, string> = {
  channelId: "所属渠道",
  apiFormat: "API 格式",
  checkIntervalSeconds: "检查频次",
  isMaintenance: "维护状态",
};

// 批量修改：勾选要改的字段，未勾选的保持不变
export function BulkEditConfigsDialog({
  open,
  count,
  channels,
  saving,
  serverError,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  count: number;
  channels: AdminChannelRecord[];
  saving: boolean;
  serverError: string | null;
  onOpenChange(open: boolean): void;
  onSubmit(patch: AdminBulkConfigPatch): void;
}) {
  const [fields, setFields] = React.useState<Set<FieldKey>>(new Set());
  const [channelId, setChannelId] = React.useState("");
  const [apiFormat, setApiFormat] =
    React.useState<NonNullable<AdminBulkConfigPatch["apiFormat"]>>("responses");
  const [interval, setInterval] = React.useState("");
  const [isMaintenance, setIsMaintenance] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setFields(new Set());
      setChannelId("");
      setApiFormat("responses");
      setInterval("");
      setIsMaintenance(false);
      setError(null);
    }
  }, [open]);

  function toggleField(key: FieldKey, checked: boolean) {
    setFields((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function handleSubmit() {
    if (fields.size === 0) {
      setError("请至少勾选一个要修改的字段");
      return;
    }
    const patch: AdminBulkConfigPatch = {};
    if (fields.has("channelId")) {
      if (!channelId) {
        setError("请选择目标渠道");
        return;
      }
      patch.channelId = channelId;
    }
    if (fields.has("apiFormat")) {
      patch.apiFormat = apiFormat;
    }
    if (fields.has("checkIntervalSeconds")) {
      if (interval.trim() === "") {
        patch.checkIntervalSeconds = null;
      } else {
        const value = Number(interval);
        if (!Number.isInteger(value) || value < 15 || value > 3600) {
          setError("检查频次必须在 15 到 3600 秒之间，留空表示使用默认");
          return;
        }
        patch.checkIntervalSeconds = value;
      }
    }
    if (fields.has("isMaintenance")) {
      patch.isMaintenance = isMaintenance;
    }
    setError(null);
    onSubmit(patch);
  }

  function fieldToggle(key: FieldKey) {
    return (
      <label className="inline-flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={fields.has(key)}
          onChange={(event) => toggleField(key, event.target.checked)}
        />
        修改{FIELD_LABEL[key]}
      </label>
    );
  }

  return (
    <Dialog
      open={open}
      title="批量修改监控项"
      description={`将修改已选的 ${count} 个监控项，只会改动勾选的字段`}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={saving} onClick={handleSubmit}>
            应用修改
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          {fieldToggle("channelId")}
          {fields.has("channelId") ? (
            <Field label="目标渠道">
              <Select
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
              >
                <option value="">选择渠道</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
        <div className="grid gap-2">
          {fieldToggle("apiFormat")}
          {fields.has("apiFormat") ? (
            <Field label="API 格式">
              <Select
                value={apiFormat}
                onChange={(event) =>
                  setApiFormat(
                    event.target.value as NonNullable<AdminBulkConfigPatch["apiFormat"]>
                  )
                }
              >
                <option value="chat_completions">Chat Completions</option>
                <option value="responses">Responses</option>
              </Select>
            </Field>
          ) : null}
        </div>
        <div className="grid gap-2">
          {fieldToggle("checkIntervalSeconds")}
          {fields.has("checkIntervalSeconds") ? (
            <Field label="检查频次覆盖（秒，留空使用默认）">
              <TextInput
                type="number"
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
              />
            </Field>
          ) : null}
        </div>
        <div className="grid gap-2">
          {fieldToggle("isMaintenance")}
          {fields.has("isMaintenance") ? (
            <Field label="维护状态">
              <Select
                value={isMaintenance ? "on" : "off"}
                onChange={(event) => setIsMaintenance(event.target.value === "on")}
              >
                <option value="off">正常检测</option>
                <option value="on">维护中（暂停检测）</option>
              </Select>
            </Field>
          ) : null}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      </div>
    </Dialog>
  );
}

// 复制到其他渠道：新监控项继承目标渠道的 Base URL 与 Key
export function BulkCopyConfigsDialog({
  open,
  count,
  channels,
  saving,
  serverError,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  count: number;
  channels: AdminChannelRecord[];
  saving: boolean;
  serverError: string | null;
  onOpenChange(open: boolean): void;
  onSubmit(channelId: string): void;
}) {
  const [channelId, setChannelId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setChannelId("");
      setError(null);
    }
  }, [open]);

  const target = channels.find((channel) => channel.id === channelId);
  const missingCredentials = target ? !target.baseUrl || !target.hasApiKey : false;

  return (
    <Dialog
      open={open}
      title="复制到其他渠道"
      description={`为已选的 ${count} 个监控项在目标渠道各建一份，目标渠道已监控的模型会跳过`}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={saving || missingCredentials}
            onClick={() => {
              if (!channelId) {
                setError("请选择目标渠道");
                return;
              }
              onSubmit(channelId);
            }}
          >
            复制
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="目标渠道">
          <Select
            value={channelId}
            onChange={(event) => {
              setChannelId(event.target.value);
              setError(null);
            }}
          >
            <option value="">选择渠道</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs text-muted-foreground">
          复制的监控项沿用模型、API 格式、频次与维护状态；端点和 API Key 改为继承目标渠道。
        </p>
        {missingCredentials ? (
          <p className="text-sm text-destructive">
            目标渠道需同时配置 Base URL 与 API Key
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      </div>
    </Dialog>
  );
}
