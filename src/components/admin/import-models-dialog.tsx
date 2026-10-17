import * as React from "react";

import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import { importChannelModels, listChannelUpstreamModels } from "./admin-api";
import type {
  AdminApiFormat,
  AdminChannelRecord,
  AdminImportModelsResult,
  AdminProviderType,
  AdminUpstreamModel,
} from "./admin-types";
import { providerOptions } from "./form-fields";
import { errorMessage } from "./use-admin-resource";

interface ImportModelsDialogProps {
  channel: AdminChannelRecord | null;
  onOpenChange(open: boolean): void;
  onImported(result: AdminImportModelsResult): void;
}

interface Row extends AdminUpstreamModel {
  selected: boolean;
}

function summarize(result: AdminImportModelsResult) {
  const parts = [`新增模型 ${result.modelsCreated} 个`];
  if (result.modelsReused > 0) {
    parts.push(`复用已有模型 ${result.modelsReused} 个`);
  }
  parts.push(`新增监控项 ${result.configsCreated} 个`);
  if (result.configsSkipped > 0) {
    parts.push(`已存在跳过 ${result.configsSkipped} 个`);
  }
  return parts.join("，");
}

export function ImportModelsDialog({
  channel,
  onOpenChange,
  onImported,
}: ImportModelsDialogProps) {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");
  const [apiFormat, setApiFormat] =
    React.useState<AdminApiFormat>("chat_completions");
  const [createConfigs, setCreateConfigs] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AdminImportModelsResult | null>(null);

  const channelId = channel?.id ?? null;
  const canCreateConfigs = Boolean(channel?.baseUrl && channel?.hasApiKey);

  React.useEffect(() => {
    if (!channelId) {
      return;
    }
    let cancelled = false;
    setRows([]);
    setFilter("");
    setResult(null);
    setSaveError(null);
    setLoadError(null);
    setLoading(true);
    listChannelUpstreamModels(channelId)
      .then((models) => {
        if (!cancelled) {
          setRows(models.map((model) => ({ ...model, selected: false })));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const keyword = filter.trim().toLowerCase();
  const visible = rows.filter((row) => !keyword || row.id.toLowerCase().includes(keyword));
  const selectable = visible.filter((row) => !row.monitored);
  const selected = rows.filter((row) => row.selected);
  const allVisibleSelected =
    selectable.length > 0 && selectable.every((row) => row.selected);

  function update(id: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  }

  function toggleAllVisible() {
    const ids = new Set(selectable.map((row) => row.id));
    setRows((current) =>
      current.map((row) =>
        ids.has(row.id) ? { ...row, selected: !allVisibleSelected } : row
      )
    );
  }

  async function submit() {
    if (!channelId || selected.length === 0) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const next = await importChannelModels(channelId, {
        createConfigs: createConfigs && canCreateConfigs,
        models: selected.map((row) => ({
          model: row.id,
          type: row.type,
          apiFormat,
        })),
      });
      setResult(next);
      setRows((current) =>
        current.map((row) =>
          row.selected
            ? {
                ...row,
                selected: false,
                modelExists: true,
                monitored: row.monitored || (createConfigs && canCreateConfigs),
              }
            : row
        )
      );
      onImported(next);
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={Boolean(channel)}
      title="获取上游模型"
      description={
        channel
          ? `从 ${channel.name} 的 /v1/models 拉取，勾选后一键创建模型与监控项`
          : undefined
      }
      onOpenChange={onOpenChange}
      footer={
        <>
          <span className="mr-auto text-xs text-muted-foreground">
            已选 {selected.length} 个
          </span>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {result ? "完成" : "取消"}
          </Button>
          <Button
            type="button"
            disabled={saving || selected.length === 0}
            onClick={submit}
          >
            {createConfigs && canCreateConfigs ? "导入并创建监控项" : "仅导入模型"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">正在获取上游模型…</p>
        ) : null}
        {loadError ? (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        ) : null}

        {!loading && !loadError ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="筛选上游模型"
                placeholder={`筛选 ${rows.length} 个模型，如 gpt、claude`}
                value={filter}
                className="min-w-[200px] flex-1"
                onChange={(event) => setFilter(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selectable.length === 0}
                onClick={toggleAllVisible}
              >
                {allVisibleSelected ? "取消全选" : `全选 ${selectable.length}`}
              </Button>
            </div>

            <div className="max-h-[45vh] overflow-auto rounded-md border">
              {visible.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  {rows.length === 0 ? "上游没有返回模型" : "没有匹配的模型"}
                </p>
              ) : (
                <ul className="divide-y">
                  {visible.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center gap-3 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        aria-label={`选择 ${row.id}`}
                        checked={row.selected}
                        disabled={row.monitored}
                        onChange={(event) =>
                          update(row.id, { selected: event.target.checked })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                        {row.id}
                      </span>
                      {row.monitored ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          已监控
                        </span>
                      ) : row.modelExists ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          模型已存在
                        </span>
                      ) : null}
                      <Select
                        aria-label={`${row.id} 的类型`}
                        value={row.type}
                        disabled={row.monitored}
                        className="h-8 w-[118px] shrink-0 text-xs"
                        onChange={(event) =>
                          update(row.id, {
                            type: event.target.value as AdminProviderType,
                          })
                        }
                      >
                        {providerOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createConfigs && canCreateConfigs}
                  disabled={!canCreateConfigs}
                  onChange={(event) => setCreateConfigs(event.target.checked)}
                />
                同时创建监控项（继承渠道 URL 与 Key）
              </label>
              <label className="inline-flex items-center gap-2">
                API 格式
                <Select
                  aria-label="API 格式"
                  value={apiFormat}
                  className="h-8 w-[150px] text-xs"
                  onChange={(event) =>
                    setApiFormat(event.target.value as AdminApiFormat)
                  }
                >
                  <option value="chat_completions">Chat Completions</option>
                  <option value="responses">Responses</option>
                </Select>
              </label>
            </div>
          </>
        ) : null}

        {result ? (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
            {summarize(result)}
          </p>
        ) : null}
        {saveError ? (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
