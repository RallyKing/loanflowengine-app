"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

const DEFAULT_DEBOUNCE_MS = 500;

type DebouncedFieldProps = {
  value: string;
  onCommit: (next: string) => void;
  debounceMs?: number;
  className?: string;
};

function useDebouncedFieldValue({
  value,
  onCommit,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: DebouncedFieldProps) {
  const [local, setLocal] = useState(value);
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  const lastCommittedRef = useRef(value);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    lastCommittedRef.current = value;
    if (!focusedRef.current) {
      setLocal(value);
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flushCommit = (next: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (next === lastCommittedRef.current) return;
    lastCommittedRef.current = next;
    onCommitRef.current(next);
  };

  const scheduleCommit = (next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (debounceMs <= 0) {
      flushCommit(next);
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushCommit(next);
    }, debounceMs);
  };

  return {
    local,
    setLocal,
    focusedRef,
    scheduleCommit,
    flushCommit,
  };
}

export type DebouncedInputProps = DebouncedFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue">;

/** Buffered text input — local state while typing; commits after debounce or blur. */
export function DebouncedInput({
  value,
  onCommit,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  className,
  onFocus,
  onBlur,
  ...rest
}: DebouncedInputProps) {
  const { local, setLocal, focusedRef, scheduleCommit, flushCommit } =
    useDebouncedFieldValue({ value, onCommit, debounceMs });

  return (
    <input
      {...rest}
      value={local}
      className={cn(
        "w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm text-foreground shadow-sm transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        className,
      )}
      onChange={(e) => {
        const next = e.currentTarget.value;
        setLocal(next);
        scheduleCommit(next);
      }}
      onFocus={(e) => {
        focusedRef.current = true;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        flushCommit(local);
        onBlur?.(e);
      }}
    />
  );
}

export type DebouncedSelectProps = DebouncedFieldProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "defaultValue"> & {
    children: React.ReactNode;
  };

/** Buffered select — commits immediately on change; ignores stale server value while open. */
export function DebouncedSelect({
  value,
  onCommit,
  debounceMs = 0,
  className,
  children,
  onFocus,
  onBlur,
  ...rest
}: DebouncedSelectProps) {
  const id = useId();
  const { local, setLocal, focusedRef, scheduleCommit, flushCommit } =
    useDebouncedFieldValue({ value, onCommit, debounceMs });

  return (
    <select
      {...rest}
      id={rest.id ?? id}
      value={local}
      className={cn(
        "w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm text-foreground shadow-sm transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        className,
      )}
      onChange={(e) => {
        const next = e.currentTarget.value;
        setLocal(next);
        scheduleCommit(next);
      }}
      onFocus={(e) => {
        focusedRef.current = true;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        flushCommit(local);
        onBlur?.(e);
      }}
    >
      {children}
    </select>
  );
}
