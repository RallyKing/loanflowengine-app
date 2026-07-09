"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Bell, BellOff, Moon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { layerZIndexStyle, overlaySurfaceClass } from "@/lib/ui/layering";

/**
 * Compact "snooze" trigger + popover used by tasks. Click the bell
 * (or moon, when already snoozed) to open a small menu with quick
 * presets ("Tomorrow", "Next week", …) plus a custom date picker.
 *
 * The open menu is rendered in a `document.body` portal with `position:
 * fixed` and a high z-index so it stays above the next card/section
 * (stacking and `overflow` on `CollapsibleSection` used to paint it under).
 *
 * The component is fully presentational: it does not call mutations
 * itself, so callers can use it wherever a snooze decision is made
 * (TaskRow, TaskDrawer, etc.).
 */
export type SnoozeMenuProps = {
  snoozedUntil: number | null | undefined;
  onSnooze: (until: number) => void | Promise<unknown>;
  onWake: () => void | Promise<unknown>;
  /** Visual size of the trigger. Defaults to "sm". */
  size?: "xs" | "sm";
  /** Render the trigger as inline text (for use inside drawer rows). */
  variant?: "icon" | "inline";
  /** Optional override label shown alongside the icon when variant="inline". */
  label?: string;
  /** Hide the trigger button — render only the popover (controlled mode). */
  hideTrigger?: boolean;
  className?: string;
  /** Stop propagation on the outer wrapper (handy on draggable rows). */
  stopPropagation?: boolean;
  /** Override popover anchor. Defaults to right-aligned beneath trigger. */
  align?: "left" | "right";
};

type Preset = {
  label: string;
  /** Compute the wake-up time. Receives "now" so tests can be deterministic. */
  compute: (now: Date) => Date;
};

function setHHMM(d: Date, h: number, m = 0): Date {
  const out = new Date(d);
  out.setHours(h, m, 0, 0);
  return out;
}

function endOfThisWeekend(now: Date): Date {
  // "Weekend" = Saturday morning if it's not yet Sunday, else next Saturday.
  const d = new Date(now);
  const day = d.getDay(); // 0=Sun..6=Sat
  let delta = 6 - day; // Days until next Saturday
  if (delta <= 0) delta += 7;
  d.setDate(d.getDate() + delta);
  return setHHMM(d, 8);
}

function nextMonday(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  const delta = ((1 + 7 - day) % 7) || 7; // Always advance to a future Monday
  d.setDate(d.getDate() + delta);
  return setHHMM(d, 8);
}

function nextMonthFirst(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1, 8, 0, 0, 0);
  return d;
}

const PRESETS: Preset[] = [
  { label: "Later today", compute: (now) => new Date(now.getTime() + 3 * 60 * 60 * 1000) },
  { label: "This evening", compute: (now) => setHHMM(now, 18) },
  { label: "Tomorrow", compute: (now) => setHHMM(new Date(now.getTime() + 24 * 60 * 60 * 1000), 8) },
  { label: "This weekend", compute: endOfThisWeekend },
  { label: "Next week", compute: nextMonday },
  { label: "Next month", compute: nextMonthFirst },
];

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const toDateInput = (ms: number) => {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const fromDateInput = (s: string): number | null => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map((p) => parseInt(p, 10));
  if (!y || !m || !d) return null;
  // Snooze targets 8am local on the chosen day so it doesn't pop right at
  // midnight (which would feel like "still today").
  return new Date(y, m - 1, d, 8, 0, 0, 0).getTime();
};

const POPUP_Z = 200;
const POPUP_W = 256; // w-64 = 16rem

function useSnoozePanelPosition(
  open: boolean,
  wrapRef: RefObject<HTMLDivElement | null>,
  align: "left" | "right"
): { top: number; left: number } {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    if (align === "right") {
      setPos({
        top: r.bottom + 4,
        left: Math.max(8, r.right - POPUP_W),
      });
    } else {
      setPos({ top: r.bottom + 4, left: r.left });
    }
  }, [open, align, wrapRef]);
  useEffect(() => {
    if (!open) return;
    const on = () => {
      if (!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      if (align === "right") {
        setPos({
          top: r.bottom + 4,
          left: Math.max(8, r.right - POPUP_W),
        });
      } else {
        setPos({ top: r.bottom + 4, left: r.left });
      }
    };
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, [open, align, wrapRef]);
  return pos;
}

export function SnoozeMenu({
  snoozedUntil,
  onSnooze,
  onWake,
  size = "sm",
  variant = "icon",
  label,
  hideTrigger = false,
  className,
  stopPropagation = false,
  align = "right",
}: SnoozeMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const customId = useId();
  const popPos = useSnoozePanelPosition(open, wrapRef, align);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isSnoozed = useMemo(() => {
    return typeof snoozedUntil === "number" && snoozedUntil > Date.now();
  }, [snoozedUntil]);

  // Re-render once when the snooze expires so the trigger label updates
  // without a full page refresh.
  useEffect(() => {
    if (!isSnoozed || typeof snoozedUntil !== "number") return;
    const ms = Math.max(0, snoozedUntil - Date.now());
    if (ms <= 0 || ms > 2_147_000_000) return; // setTimeout max ~24.8 days
    const t = window.setTimeout(() => {
      // Force a re-render via state mutation that doesn't change behaviour.
      setOpen((o) => o);
    }, ms + 50);
    return () => window.clearTimeout(t);
  }, [snoozedUntil, isSnoozed]);

  // Outside-click + escape dismiss.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if ((e.target as HTMLElement | null)?.closest?.("[data-snooze-panel]")) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handlePreset = async (p: Preset) => {
    const t = p.compute(new Date()).getTime();
    if (t <= Date.now()) return;
    await onSnooze(t);
    setOpen(false);
  };

  const handleCustom = async (s: string) => {
    const t = fromDateInput(s);
    if (t == null || t <= Date.now()) return;
    await onSnooze(t);
    setOpen(false);
  };

  const handleWake = async () => {
    await onWake();
    setOpen(false);
  };

  const triggerSizeClasses =
    size === "xs"
      ? "h-6 w-6 text-[10px]"
      : "h-7 w-7 text-xs";

  return (
    <div
      ref={wrapRef}
      className={cn("relative inline-flex", className)}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
      }}
    >
      {!hideTrigger &&
        (variant === "icon" ? (
          <button
            type="button"
            aria-label={isSnoozed ? "Snoozed — click to change" : "Snooze task"}
            title={
              isSnoozed && typeof snoozedUntil === "number"
                ? `Snoozed until ${fmtDate(snoozedUntil)}`
                : "Snooze task"
            }
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className={cn(
              "inline-flex items-center justify-center rounded-md border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              isSnoozed && "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
              triggerSizeClasses
            )}
          >
            {isSnoozed ? (
              <Moon className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Bell className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
              isSnoozed
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            title={
              isSnoozed && typeof snoozedUntil === "number"
                ? `Snoozed until ${fmtDate(snoozedUntil)}`
                : "Snooze task"
            }
          >
            {isSnoozed ? (
              <Moon className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Bell className="h-3.5 w-3.5" aria-hidden />
            )}
            <span>
              {label ??
                (isSnoozed && typeof snoozedUntil === "number"
                  ? `Snoozed · ${fmtDate(snoozedUntil)}`
                  : "Snooze")}
            </span>
          </button>
        ))}
      {open && mounted
        ? createPortal(
            <div
              data-snooze-panel
              className={cn(
                overlaySurfaceClass("dropdown"),
                "w-64",
              )}
              style={{
                position: "fixed",
                top: popPos.top,
                left: popPos.left,
                ...layerZIndexStyle("DROPDOWN"),
              }}
              role="dialog"
              aria-label="Snooze options"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Snooze until…
              </div>
              <ul className="py-1 text-sm">
                {PRESETS.map((p) => {
                  const t = p.compute(new Date()).getTime();
                  const enabled = t > Date.now();
                  return (
                    <li key={p.label}>
                      <button
                        type="button"
                        disabled={!enabled}
                        onClick={() => void handlePreset(p)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span>{p.label}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {fmtDate(t)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-border px-3 py-2">
                <label
                  htmlFor={customId}
                  className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Pick a date
                </label>
                <input
                  id={customId}
                  type="date"
                  min={toDateInput(Date.now() + 24 * 60 * 60 * 1000)}
                  defaultValue={
                    typeof snoozedUntil === "number" && snoozedUntil > Date.now()
                      ? toDateInput(snoozedUntil)
                      : toDateInput(Date.now() + 24 * 60 * 60 * 1000)
                  }
                  onChange={(e) => void handleCustom(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                />
              </div>
              {isSnoozed && (
                <div className="border-t border-border bg-muted/30 px-3 py-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => void handleWake()}
                    title="Clear snooze and surface the task again"
                  >
                    <BellOff className="h-3.5 w-3.5" /> Wake up now
                  </Button>
                </div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

/**
 * Lightweight badge that shows "💤 until {date}" — handy on rows where the
 * caller already has a snooze trigger somewhere else and just wants a
 * read-only indicator.
 */
export function SnoozedBadge({
  until,
  className,
}: {
  until: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800",
        className
      )}
      title={`Snoozed until ${fmtDate(until)}`}
    >
      <Moon className="h-3 w-3" aria-hidden /> until {fmtDate(until)}
    </span>
  );
}

/**
 * Predicate: is the task currently snoozed (i.e. should be hidden from
 * default views)?
 */
export function isSnoozed(t: { snoozedUntil?: number | null | undefined }): boolean {
  return typeof t.snoozedUntil === "number" && t.snoozedUntil > Date.now();
}
