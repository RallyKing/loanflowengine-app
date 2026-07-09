"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

const QUICK_REASONS = [
  "Blurry",
  "Missing Page 2",
  "Expired",
  "Wrong document",
  "Incomplete",
] as const;

export type DocumentVaultRejectPopoverProps = {
  documentTitle: string;
  busy?: boolean;
  onSubmit: (reason: string) => void;
  onClose: () => void;
  className?: string;
};

export function DocumentVaultRejectPopover({
  documentTitle,
  busy,
  onSubmit,
  onClose,
  className,
}: DocumentVaultRejectPopoverProps) {
  const [reason, setReason] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Reject ${documentTitle}`}
      className={cn(
        "absolute right-0 top-full z-20 mt-1 w-56 rounded-dlc-md border border-border/80 bg-dlc-surface-high p-2 shadow-dlc-2",
        className,
      )}
      data-testid="document-vault-reject-popover"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Reject &amp; request re-upload
      </p>
      <div className="mb-2 flex flex-wrap gap-1">
        {QUICK_REASONS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
            disabled={busy}
            onClick={() => submit(chip)}
          >
            {chip}
          </button>
        ))}
      </div>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Custom reason…"
        className="mb-2 h-8 text-xs"
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit(reason);
          }
        }}
      />
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 border-rose-500/40 text-xs text-rose-700 hover:bg-rose-500/10 dark:text-rose-400"
          disabled={busy || !reason.trim()}
          onClick={() => submit(reason)}
          data-testid="document-vault-reject-submit"
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
