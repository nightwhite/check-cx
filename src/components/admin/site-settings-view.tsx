import * as React from "react";

import { Button } from "../../../components/ui/button";
import {
  getAdminSiteSettings,
  updateAdminSiteSettings,
} from "./admin-api";
import { Field, JsonTextarea, TextInput } from "./form-fields";
import { errorMessage } from "./use-admin-resource";
import { AdminViewLayout } from "./view-layout";

export function SiteSettingsView() {
  const [siteName, setSiteName] = React.useState("");
  const [statusTitle, setStatusTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [logoUrl, setLogoUrl] = React.useState("");
  const [faviconUrl, setFaviconUrl] = React.useState("");
  const [publicOrigin, setPublicOrigin] = React.useState("");
  const [defaultCheckIntervalSeconds, setDefaultCheckIntervalSeconds] =
    React.useState("60");
  const [notificationCooldownSeconds, setNotificationCooldownSeconds] =
    React.useState("300");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const settings = await getAdminSiteSettings();
        if (!cancelled) {
          setSiteName(settings.siteName);
          setStatusTitle(settings.statusTitle);
          setDescription(settings.description ?? "");
          setLogoUrl(settings.logoUrl ?? "");
          setFaviconUrl(settings.faviconUrl ?? "");
          setPublicOrigin(settings.publicOrigin ?? "");
          setDefaultCheckIntervalSeconds(
            String(settings.defaultCheckIntervalSeconds)
          );
          setNotificationCooldownSeconds(
            String(settings.notificationCooldownSeconds)
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(errorMessage(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function validate() {
    const nextErrors: Record<string, string> = {};
    if (!siteName.trim()) {
      nextErrors.siteName = "站点名称必填";
    }
    if (!statusTitle.trim()) {
      nextErrors.statusTitle = "状态页标题必填";
    }
    const defaultInterval = Number(defaultCheckIntervalSeconds);
    if (
      !Number.isInteger(defaultInterval) ||
      defaultInterval < 15 ||
      defaultInterval > 3600
    ) {
      nextErrors.defaultCheckIntervalSeconds =
        "默认检查频次必须在 15 到 3600 秒之间";
    }
    const cooldown = Number(notificationCooldownSeconds);
    if (!Number.isInteger(cooldown) || cooldown < 60 || cooldown > 86400) {
      nextErrors.notificationCooldownSeconds =
        "通知冷却时间必须在 60 到 86400 秒之间";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function save() {
    setMessage(null);
    setError(null);
    if (!validate()) {
      return;
    }

    setSaving(true);
    try {
      const saved = await updateAdminSiteSettings({
        siteName,
        statusTitle,
        description: description || null,
        logoUrl: logoUrl || null,
        faviconUrl: faviconUrl || null,
        publicOrigin: publicOrigin || null,
        defaultCheckIntervalSeconds: Number(defaultCheckIntervalSeconds),
        notificationCooldownSeconds: Number(notificationCooldownSeconds),
      });
      setSiteName(saved.siteName);
      setStatusTitle(saved.statusTitle);
      setDescription(saved.description ?? "");
      setLogoUrl(saved.logoUrl ?? "");
      setFaviconUrl(saved.faviconUrl ?? "");
      setPublicOrigin(saved.publicOrigin ?? "");
      setDefaultCheckIntervalSeconds(String(saved.defaultCheckIntervalSeconds));
      setNotificationCooldownSeconds(String(saved.notificationCooldownSeconds));
      setMessage("站点设置已保存");
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminViewLayout
      title="站点设置"
      description="配置公开状态页的基础信息和默认监控节奏"
    >
      {loading ? <p className="text-sm text-muted-foreground">正在加载站点设置</p> : null}
      {!loading ? (
        <section className="grid gap-4 rounded-lg border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="站点名称" error={errors.siteName}>
              <TextInput
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
              />
            </Field>
            <Field label="状态页标题" error={errors.statusTitle}>
              <TextInput
                value={statusTitle}
                onChange={(event) => setStatusTitle(event.target.value)}
              />
            </Field>
          </div>
          <Field label="描述">
            <JsonTextarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Logo URL">
              <TextInput
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
              />
            </Field>
            <Field label="Favicon URL">
              <TextInput
                value={faviconUrl}
                onChange={(event) => setFaviconUrl(event.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="公开域名">
              <TextInput
                value={publicOrigin}
                onChange={(event) => setPublicOrigin(event.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="默认检查频次（秒）"
              error={errors.defaultCheckIntervalSeconds}
            >
              <TextInput
                type="number"
                min={15}
                max={3600}
                value={defaultCheckIntervalSeconds}
                onChange={(event) =>
                  setDefaultCheckIntervalSeconds(event.target.value)
                }
              />
            </Field>
            <Field
              label="通知冷却时间（秒）"
              error={errors.notificationCooldownSeconds}
            >
              <TextInput
                type="number"
                min={60}
                max={86400}
                value={notificationCooldownSeconds}
                onChange={(event) =>
                  setNotificationCooldownSeconds(event.target.value)
                }
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={saving} onClick={save}>
              保存站点设置
            </Button>
            {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </section>
      ) : null}
    </AdminViewLayout>
  );
}
