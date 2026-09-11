"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PortalOverlayPanel } from "@/components/ui/PortalOverlayPanel";
import { cn } from "@/lib/cn";
import {
  normalizeReoListingUrl,
  reoListingHref,
  reoListingUrlError,
} from "@/lib/reo/zillowUrl";

const PANEL_WIDTH = 320;

type ReoZillowUrlControlProps = {
  value?: string;
  onChange: (next: string) => void;
  rowLabel: string;
};

export function ReoZillowUrlControl({
  value,
  onChange,
  rowLabel,
}: ReoZillowUrlControlProps) {
  const href = reoListingHref(value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: PANEL_WIDTH });

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, Math.max(240, window.innerWidth - 16));
    const left = Math.max(
      8,
      Math.min(r.right - width, window.innerWidth - width - 8),
    );
    const below = r.bottom + 6;
    const estimatedH = 200;
    const top =
      below + estimatedH > window.innerHeight - 8
        ? Math.max(8, r.top - estimatedH - 6)
        : below;
    setPos({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open, updatePos]);

  useLayoutEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open, updatePos]);

  function openEditor() {
    setDraft(value ?? "");
    setError(null);
    setOpen(true);
  }

  function save() {
    const err = reoListingUrlError(draft);
    if (err) {
      setError(err);
      return;
    }
    const next = normalizeReoListingUrl(draft) ?? "";
    onChange(next);
    setOpen(false);
  }

  function clear() {
    setDraft("");
    setError(null);
    onChange("");
    setOpen(false);
  }

  const iconBtn =
    "h-10 w-10 min-h-[40px] min-w-[40px] shrink-0 p-0 rounded-dlc-sm";

  return (
    <>
      <div className="flex shrink-0 items-center gap-0.5">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              iconBtn,
              "inline-flex items-center justify-center text-primary",
              "transition-[color,background-color] duration-dlc-short1 ease-dlc-standard",
              "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-brand-accent focus-visible:ring-offset-1",
            )}
            aria-label={`Open listing for ${rowLabel}`}
            title="Open listing"
            data-testid="reo-zillow-open"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        ) : null}
        <div ref={triggerRef} data-portal-overlay-trigger>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              iconBtn,
              href ? "text-primary" : "text-muted-foreground",
            )}
            aria-label={
              href
                ? `Edit listing URL for ${rowLabel}`
                : `Paste listing URL for ${rowLabel}`
            }
            aria-expanded={open}
            title={href ? "Edit listing URL" : "Paste Zillow URL"}
            data-testid="reo-zillow-edit"
            onClick={() => (open ? setOpen(false) : openEditor())}
          >
            <Link2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
      <PortalOverlayPanel
        open={open}
        onClose={() => setOpen(false)}
        position={pos}
        layer="DROPDOWN"
        role="dialog"
        aria-label={`Listing URL for ${rowLabel}`}
        data-testid="reo-zillow-popover"
        className="dlc-surface-overlay p-3"
      >
        <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Zillow / listing URL
        </label>
        <input
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://www.zillow.com/homedetails/…"
          className={cn(
            "mt-1.5 h-10 min-h-[40px] w-full rounded-dlc-sm border border-border/80",
            "bg-dlc-surface px-2 text-sm text-foreground",
            "focus-visible:border-primary/45 focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-primary/20",
          )}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          data-testid="reo-zillow-input"
        />
        {error ? (
          <p className="mt-1.5 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Paste a Zillow or listing link to reopen later.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-10 min-h-[40px]"
            onClick={clear}
            data-testid="reo-zillow-clear"
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-10 min-h-[40px]"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-10 min-h-[40px]"
            onClick={save}
            data-testid="reo-zillow-save"
          >
            Save
          </Button>
        </div>
      </PortalOverlayPanel>
    </>
  );
}
