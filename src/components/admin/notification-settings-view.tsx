import * as React from "react";

import { Button } from "../../../components/ui/button";
import {
  getAdminNotificationSettings,
  updateAdminNotificationSettings,
} from "./admin-api";
import { Field, TextInput } from "./form-fields";
import { errorMessage } from "./use-admin-resource";
import { AdminViewLayout } from "./view-layout";

export function NotificationSettingsView() {
  const [enabled, setEnabled] = React.useState(false);
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [hasWebhookUrl, setHasWebhookUrl] = React.useState(false);
  const [notifyDegraded, setNotifyDegraded] = React.useState(true);
  const [notifyFailed, setNotifyFailed] = React.useState(true);
  const [notifyRecovered, setNotifyRecovered] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const settings = await getAdminNotificationSettings();
        if (!cancelled) {
          setEnabled(settings.enabled);
          setHasWebhookUrl(settings.hasWebhookUrl);
          setNotifyDegraded(settings.notifyDegraded);
          setNotifyFailed(settings.notifyFailed);
          setNotifyRecovered(settings.notifyRecovered);
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

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await updateAdminNotificationSettings({
        enabled,
        webhookUrl: webhookUrl || null,
        notifyDegraded,
        notifyFailed,
        notifyRecovered,
      });
      setEnabled(saved.enabled);
      setHasWebhookUrl(saved.hasWebhookUrl);
      setWebhookUrl("");
      setNotifyDegraded(saved.notifyDegraded);
      setNotifyFailed(saved.notifyFailed);
      setNotifyRecovered(saved.notifyRecovered);
      setMessage("通知设置已保存");
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminViewLayout
      title="通知设置"
      description="配置飞书 Webhook，及时发现模型监控异常"
    >
      {loading ? <p className="text-sm text-muted-foreground">正在加载通知设置</p> : null}
      {!loading ? (
        <section className="grid gap-4 rounded-lg border bg-card p-4">
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            启用通知
          </label>
          <Field label="飞书 Webhook URL">
            <TextInput
              type="password"
              value={webhookUrl}
              placeholder={hasWebhookUrl ? "已配置，留空将清除" : ""}
              autoComplete="new-password"
              onChange={(event) => setWebhookUrl(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={notifyDegraded}
                onChange={(event) => setNotifyDegraded(event.target.checked)}
              />
              延迟通知
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={notifyFailed}
                onChange={(event) => setNotifyFailed(event.target.checked)}
              />
              异常通知
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={notifyRecovered}
                onChange={(event) => setNotifyRecovered(event.target.checked)}
              />
              恢复通知
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={saving} onClick={save}>
              保存通知设置
            </Button>
            {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </section>
      ) : null}
    </AdminViewLayout>
  );
}
