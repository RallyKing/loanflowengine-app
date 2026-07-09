"use client";

import {
  RecordInspectorBody,
  RecordInspectorFooter,
  RecordInspectorHeader,
  RecordInspectorShell,
} from "@/components/RecordInspectorShell";
import { cn } from "@/lib/cn";

/**
 * Non-blocking confirm pattern on the record inspector shell (side / bottom sheet).
 * Initial focus lands on the panel; cancel is first in tab order (destructive safety).
 */
export function ConfirmActionSheet({
  open,
  title,
  description,
  cancelLabel = "Cancel",
  confirmLabel,
  confirmVariant = "default",
  onCancel,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  cancelLabel?: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  if (!open) return null;

  return (
    <RecordInspectorShell
      ariaLabel={title}
      onClose={onCancel}
      scrimCloseEnabled={!busy}
      escapeCloseEnabled={!busy}
      panelClassName="max-md:max-h-[min(88dvh,100dvh)]"
    >
      <RecordInspectorHeader>
        <h2 className="text-dlc-title-lg font-semibold leading-dlc-title-lg tracking-dlc-title-lg text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-dlc-body-md leading-dlc-body-md tracking-dlc-body-md text-muted-foreground">
            {description}
          </p>
        ) : null}
      </RecordInspectorHeader>
      <RecordInspectorBody>{null}</RecordInspectorBody>
      <RecordInspectorFooter className="bg-background">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="inline-flex min-h-[var(--dlc-touch-target-min)] items-center justify-center rounded-dlc-md border border-border bg-background px-4 py-2 text-dlc-label-lg font-medium text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex min-h-[var(--dlc-touch-target-min)] items-center justify-center rounded-dlc-md px-4 py-2 text-dlc-label-lg font-medium text-primary-fg transition-colors disabled:opacity-50",
              confirmVariant === "destructive"
                ? "bg-destructive hover:bg-destructive/90"
                : "bg-primary hover:bg-primary/90",
            )}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </RecordInspectorFooter>
    </RecordInspectorShell>
  );
}
