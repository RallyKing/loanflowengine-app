"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

export type PersistFieldStatus = "idle" | "pending" | "saved" | "error";

type Props = {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  debounceMs?: number;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
  disabled?: boolean;
};

/**
 * Controlled rename field: 300ms debounce, Enter commits, Escape reverts,
 * blur commits if dirty. Skips writes when trimmed value unchanged.
 */
export function DebouncedPersistedField({
  value: serverValue,
  onSave,
  debounceMs = 300,
  className,
  inputClassName,
  "aria-label": ariaLabel,
  disabled = false,
}: Props) {
  const statusId = useId();
  const [local, setLocal] = useState(serverValue);
  const [status, setStatus] = useState<PersistFieldStatus>("idle");
  const baselineRef = useRef(serverValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    setLocal(serverValue);
    baselineRef.current = serverValue;
  }, [serverValue]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commit = useCallback(
    async (raw: string, opts?: { immediate?: boolean }) => {
      clearTimer();
      const trimmed = raw.trim();
      if (!trimmed || trimmed === baselineRef.current) {
        if (raw !== baselineRef.current) setLocal(baselineRef.current);
        return;
      }
      if (savingRef.current && !opts?.immediate) return;
      savingRef.current = true;
      setStatus("pending");
      try {
        await onSave(trimmed);
        baselineRef.current = trimmed;
        setLocal(trimmed);
        setStatus("saved");
        window.setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1600);
      } catch {
        setStatus("error");
      } finally {
        savingRef.current = false;
      }
    },
    [clearTimer, onSave],
  );

  const schedule = useCallback(
    (next: string) => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void commit(next);
      }, debounceMs);
    },
    [clearTimer, commit, debounceMs],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit(local, { immediate: true });
    } else if (e.key === "Escape") {
      e.preventDefault();
      clearTimer();
      setLocal(baselineRef.current);
      setStatus("idle");
    }
  };

  const statusLabel =
    status === "pending"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? "Save failed"
          : "";

  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Input
        value={local}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={statusLabel ? statusId : undefined}
        className={cn(inputClassName, status === "saved" && "border-emerald-500/50")}
        onChange={(e) => {
          const next = e.target.value;
          setLocal(next);
          if (status === "saved" || status === "error") setStatus("idle");
          schedule(next);
        }}
        onBlur={() => void commit(local, { immediate: true })}
        onKeyDown={onKeyDown}
      />
      {statusLabel ? (
        <span
          id={statusId}
          className={cn(
            "pointer-events-none absolute -bottom-4 left-0 text-[10px] font-medium tabular-nums",
            status === "pending" && "text-muted-foreground",
            status === "saved" && "text-emerald-700 dark:text-emerald-400",
            status === "error" && "text-destructive",
          )}
          aria-live="polite"
        >
          {statusLabel}
        </span>
      ) : null}
    </div>
  );
}
