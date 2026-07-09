"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { parseClientMomentum } from "@/lib/clientMomentum";
import {
  shellPanelZIndex,
  shellZIndexStyle,
} from "@/lib/ui/layerTokens";

type Size = "sm" | "md";
type Variant = "inline" | "header";

export type ClientMomentumCommitValue = number | null;

const OPTIONS: ReadonlyArray<{ value: ClientMomentumCommitValue; label: string }> =
  [
    { value: null, label: "Unrated" },
    { value: 1, label: "★" },
    { value: 2, label: "★★" },
    { value: 3, label: "★★★" },
    { value: 4, label: "★★★★" },
    { value: 5, label: "★★★★★" },
  ];

function useNarrowPopoverTray() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}

function StarRow({
  level,
  dim,
  outlineStar,
  filledStar,
}: {
  level: number | undefined;
  dim: string;
  outlineStar: string;
  filledStar: string;
}) {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            dim,
            level != null && i <= level ? filledStar : outlineStar,
          )}
          aria-hidden
        />
      ))}
    </>
  );
}

export function ClientMomentumStars({
  value,
  readOnly,
  disabled,
  onCommit,
  className,
  size = "sm",
  variant = "inline",
}: {
  value?: number | null;
  readOnly?: boolean;
  disabled?: boolean;
  onCommit?: (next: ClientMomentumCommitValue) => void | Promise<void>;
  className?: string;
  size?: Size;
  variant?: Variant;
}) {
  const committed = parseClientMomentum(value);
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [optimistic, setOptimistic] = useState<number | null | "clear">(null);
  const narrowTray = useNarrowPopoverTray();
  const [pos, setPos] = useState({ top: 0, left: 0, width: 200 });

  const displayLevel =
    optimistic === "clear"
      ? undefined
      : optimistic != null
        ? optimistic
        : committed;

  const dim =
    variant === "header"
      ? size === "md"
        ? "h-3 w-3"
        : "h-2.5 w-2.5"
      : size === "md"
        ? "h-2.5 w-2.5"
        : "h-2 w-2";

  const outlineStar = "fill-transparent text-muted-foreground/40 stroke-[1.25]";
  const filledStar =
    "fill-amber-400/85 text-amber-500/75 dark:fill-amber-400/70 dark:text-amber-400/65";

  const close = useCallback(() => {
    setOpen(false);
    setEntered(false);
  }, []);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const panelW = Math.min(220, vw - 16);
    let left = r.left;
    if (left + panelW > vw - 8) left = vw - 8 - panelW;
    if (left < 8) left = 8;
    const margin = 8;
    const estH = 320;
    let top = r.bottom + margin;
    if (top + estH > window.innerHeight - margin) {
      top = Math.max(margin, r.top - margin - estH);
    }
    setPos({ top, left, width: Math.max(r.width, panelW) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onScroll = () => measure();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, measure]);

  useLayoutEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, close]);

  useEffect(() => {
    setOptimistic(null);
  }, [committed]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      const root = panelRef.current;
      if (!root) return;
      const sel = root.querySelector<HTMLButtonElement>(
        'button[role="option"][aria-selected="true"]',
      );
      (sel ?? root.querySelector<HTMLButtonElement>('button[role="option"]'))?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const onListboxKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = [
      ...(panelRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ) ?? []),
    ];
    if (buttons.length === 0) return;
    const active = document.activeElement;
    const i = buttons.indexOf(active as HTMLButtonElement);
    const nextIdx =
      e.key === "ArrowDown"
        ? Math.min(buttons.length - 1, i < 0 ? 0 : i + 1)
        : Math.max(0, i <= 0 ? 0 : i - 1);
    buttons[nextIdx]?.focus();
  };

  const commit = async (next: ClientMomentumCommitValue) => {
    const same =
      (next === null && committed === undefined) ||
      (next !== null && next === committed);
    if (disabled || same) {
      close();
      return;
    }
    setOptimistic(next === null ? "clear" : next);
    try {
      await onCommit?.(next);
      close();
    } catch {
      setOptimistic(null);
    }
  };

  if (readOnly) {
    return (
      <div
        className={cn(
          "inline-flex shrink-0 flex-nowrap items-center gap-0 cursor-default select-none",
          className,
        )}
        aria-label={
          committed == null
            ? "Client confidence unrated"
            : `Client confidence ${committed} of 5`
        }
      >
        <StarRow
          level={committed}
          dim={dim}
          outlineStar={outlineStar}
          filledStar={filledStar}
        />
      </div>
    );
  }

  const portal =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        <div
          aria-hidden
          className={cn(
            "fixed inset-0 transition-opacity duration-dlc-short1 ease-dlc-standard",
            narrowTray ? "bg-[var(--dlc-scrim,oklch(0%_0_0_/0.35))]" : "bg-transparent",
            entered ? "opacity-100" : "opacity-0",
          )}
          style={shellZIndexStyle("tooltip")}
          onPointerDown={() => {
            close();
          }}
        />
        <div
          ref={panelRef}
          id={listboxId}
          role="listbox"
          aria-label="Client confidence"
          className={cn(
            "dlc-surface-overlay max-h-[min(320px,calc(100dvh-24px))] overflow-y-auto rounded-xl border border-border/85 shadow-dlc-2 outline-none transition-[opacity,transform] duration-dlc-short1 ease-dlc-standard",
            narrowTray
              ? cn(
                  "fixed left-3 right-3 mx-auto max-w-lg p-1.5",
                  entered
                    ? "translate-y-0 opacity-100"
                    : "translate-y-2 opacity-0",
                )
              : cn(
                  "fixed min-w-[11rem] p-1.5",
                  entered
                    ? "translate-y-0 opacity-100"
                    : "-translate-y-0.5 opacity-0",
                ),
          )}
          style={
            narrowTray
              ? {
                  ...shellPanelZIndex("modal"),
                  bottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
                }
              : {
                  ...shellPanelZIndex("modal"),
                  top: pos.top,
                  left: pos.left,
                  width: pos.width,
                }
          }
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={onListboxKeyDown}
        >
          {OPTIONS.map((opt) => {
            const selected =
              opt.value === null
                ? committed === undefined
                : committed === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  "flex w-full min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors duration-dlc-short1 ease-dlc-standard",
                  "focus-visible:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  selected
                    ? "bg-muted/70"
                    : "hover:bg-muted/60 active:bg-muted/80",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  void commit(opt.value);
                }}
              >
                <span className="w-24 shrink-0 text-muted-foreground">
                  {opt.value === null ? (
                    <span className="text-xs tracking-wide">Unrated</span>
                  ) : (
                    <span className="tabular-nums" aria-hidden>
                      {"★".repeat(opt.value)}
                    </span>
                  )}
                </span>
                {opt.value != null ? (
                  <span className="inline-flex shrink-0 gap-0">
                    <StarRow
                      level={opt.value}
                      dim="h-3.5 w-3.5"
                      outlineStar={outlineStar}
                      filledStar={filledStar}
                    />
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 gap-0 opacity-70">
                    <StarRow
                      level={undefined}
                      dim="h-3.5 w-3.5"
                      outlineStar={outlineStar}
                      filledStar={filledStar}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </>,
      document.body,
    );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "inline-flex shrink-0 flex-nowrap items-center gap-0 rounded-sm text-left",
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/55 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "motion-safe:hover:bg-muted/35 motion-safe:transition-colors motion-safe:duration-dlc-short1 motion-safe:ease-dlc-standard",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        aria-label={
          committed == null
            ? "Set client confidence, currently unrated"
            : `Set client confidence, currently ${committed} of 5`
        }
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (disabled) return;
          setOpen((o) => !o);
        }}
      >
        <StarRow
          level={displayLevel}
          dim={dim}
          outlineStar={outlineStar}
          filledStar={filledStar}
        />
      </button>
      {portal}
    </>
  );
}
