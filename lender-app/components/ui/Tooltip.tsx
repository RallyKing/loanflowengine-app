"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

const SHOW_DELAY_MS = 200;

type TooltipProps = {
  content: string;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
};

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: TooltipProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleShow = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
  }, [clearTimer]);

  const hide = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, [clearTimer]);

  const onBlur = (e: FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      hide();
    }
  };

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={scheduleShow}
      onMouseLeave={hide}
      onFocus={scheduleShow}
      onBlur={onBlur}
    >
      <span aria-describedby={visible ? id : undefined}>{children}</span>
      {visible ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute left-1/2 z-[var(--dlc-z-popover,35)] isolate max-w-[16rem] -translate-x-1/2 whitespace-normal rounded-dlc-sm border border-border/90 bg-background px-2 py-1 text-center text-[11px] font-medium leading-snug text-foreground shadow-dlc-2 [background-color:rgb(var(--bg))]",
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
