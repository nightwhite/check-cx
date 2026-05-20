import { Button } from "../../../components/ui/button";
import { Dialog } from "../../../components/ui/dialog";

interface DeleteConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  error: string | null;
  onOpenChange(open: boolean): void;
  onConfirm(): void;
}

export function DeleteConfirmDialog({
  open,
  title,
  description,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            确认删除
          </Button>
        </>
      }
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </Dialog>
  );
}
