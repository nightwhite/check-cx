import * as React from "react";

import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";
import { Select } from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import { Field } from "./form-fields";
import type {
  AdminNotificationLevel,
  AdminNotificationRecord,
} from "./admin-types";

interface NotificationFormProps {
  open: boolean;
  record: AdminNotificationRecord | null;
  saving: boolean;
  serverError: string | null;
  onOpenChange(open: boolean): void;
  onSubmit(payload: Record<string, unknown>): void;
}

export function NotificationForm({
  open,
  record,
  saving,
  serverError,
  onOpenChange,
  onSubmit,
}: NotificationFormProps) {
  const [message, setMessage] = React.useState("");
  const [level, setLevel] = React.useState<AdminNotificationLevel>("info");
  const [isActive, setIsActive] = React.useState(true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setMessage(record?.message ?? "");
    setLevel(record?.level ?? "info");
    setIsActive(record?.isActive ?? true);
    setErrors({});
  }, [open, record]);

  function handleSubmit() {
    const nextErrors: Record<string, string> = {};
    if (!message.trim()) {
      nextErrors.message = "通知内容必填";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    onSubmit({ message, level, isActive });
  }

  return (
    <Dialog
      open={open}
      title={record ? "编辑通知" : "新增通知"}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={saving} onClick={handleSubmit}>
            保存通知
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="通知内容" error={errors.message}>
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </Field>
        <Field label="级别">
          <Select
            value={level}
            onChange={(event) =>
              setLevel(event.target.value as AdminNotificationLevel)
            }
          >
            <option value="info">信息</option>
            <option value="warning">警告</option>
            <option value="error">异常</option>
          </Select>
        </Field>
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          显示通知
        </label>
        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      </div>
    </Dialog>
  );
}
