import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** ConfirmationModal §10.1 — mobile bottom sheet, desktop centered */
export function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center animate-fade-in">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        aria-label="Close"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="confirm-title"
        className="relative z-10 flex max-h-[min(92dvh,640px)] w-full flex-col overflow-hidden rounded-t-2xl border border-[rgba(14,31,26,0.1)] bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-none sm:max-h-[min(85dvh,560px)] sm:max-w-md sm:rounded-xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[rgba(14,31,26,0.12)] sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="confirm-title" className="text-base font-bold text-[#0E1F1A]">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-[13px] font-medium text-[#5A6B7D]">{description}</p>
            )}
          </div>
          <button type="button" onClick={onCancel} className="touch-target flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4 text-[#5A6B7D]" />
          </button>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary min-h-[48px] w-full sm:w-auto" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cn(
              "min-h-[48px] w-full rounded-2xl px-5 py-2.5 text-sm font-bold text-white active:scale-[0.985] sm:w-auto",
              destructive ? "bg-destructive hover:bg-destructive/90" : "btn-primary"
            )}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
