"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Plus, X } from "lucide-react";

type FileTaskBatchCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (titles: string[]) => Promise<void>;
};

export function FileTaskBatchCreateModal({
  open,
  onClose,
  onSubmit,
}: FileTaskBatchCreateModalProps) {
  const [rows, setRows] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (open) {
      setRows([""]);
      requestAnimationFrame(() => inputRefs.current[0]?.focus());
    }
  }, [open]);

  const addRowAfter = useCallback((index: number) => {
    setRows((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, "");
      return next;
    });
    requestAnimationFrame(() => inputRefs.current[index + 1]?.focus());
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => {
      if (prev.length <= 1) return [""];
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const updateRow = useCallback((index: number, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const trimmed = rows[index]?.trim();
        if (trimmed) {
          addRowAfter(index);
        }
      }
    },
    [addRowAfter, rows],
  );

  const titles = rows.map((r) => r.trim()).filter((r) => r.length > 0);

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      aria-label="Add file tasks"
      panelClassName="w-full max-w-lg p-5"
    >
      <h3 className="text-sm font-semibold text-foreground">Add file tasks</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Type a requirement name and press Enter to add another row. All tasks are
        created in one batch.
      </p>

      <ul className="mt-4 max-h-[min(50vh,320px)] space-y-2 overflow-y-auto overscroll-contain">
        {rows.map((value, index) => (
          <li key={index} className="flex items-center gap-2">
            <Input
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              value={value}
              onChange={(e) => updateRow(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              placeholder={
                index === 0 ? "e.g. 6 Months Bank Statements" : "Requirement name"
              }
              className="h-10 min-w-0 flex-1"
              aria-label={`File task ${index + 1}`}
            />
            {rows.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 w-10 shrink-0 p-0"
                onClick={() => removeRow(index)}
                aria-label="Remove row"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 h-8 gap-1.5 px-2 text-xs"
        onClick={() => addRowAfter(rows.length - 1)}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add row
      </Button>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || titles.length === 0}
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                await onSubmit(titles);
                onClose();
              } finally {
                setBusy(false);
              }
            })();
          }}
          data-testid="file-task-batch-create-submit"
        >
          {busy ? "Creating…" : `Create all (${titles.length})`}
        </Button>
      </div>
    </OverlayShell>
  );
}
