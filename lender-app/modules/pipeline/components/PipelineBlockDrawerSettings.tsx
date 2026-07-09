"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Input, Label } from "@/components/ui/Input";
import { SectionFieldCountBadge } from "@/components/SectionFieldCountBadge";
import {
  getPipelineBlockSettingsSchema,
  type PipelineBlockId,
} from "@/lib/pipelineBlockRegistry";
import type { PipelineDrawerLayoutV1 } from "@/lib/pipelineDrawerLayoutStorage";
import type { PipelineDrawerSectionId } from "@/lib/pipelineDrawerLayoutStorage";
import type { PipelineBlockSettingsSchema } from "@/lib/pipelineBlockSettingsSchema";
import {
  getRawDrawerBlockSettings,
  resolveDrawerBlockSettings,
  setDrawerBlockSettings,
} from "@/lib/pipelineDrawerBlockSettings";
import { zIndexStyle } from "@/lib/platform-framework";

function humanizePropKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function iterObjectProperties(
  schema: PipelineBlockSettingsSchema | null,
): Array<{ key: string; def: Readonly<Record<string, unknown>> }> {
  if (!schema || schema.type !== "object") return [];
  const props = schema.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return [];
  return Object.entries(props).map(([key, def]) => ({
    key,
    def:
      def && typeof def === "object" && !Array.isArray(def)
        ? (def as Readonly<Record<string, unknown>>)
        : {},
  }));
}

function coerceFromUi(
  def: Readonly<Record<string, unknown>>,
  raw: unknown,
): unknown {
  const t = def.type;
  if (t === "boolean") {
    return Boolean(raw);
  }
  if (t === "number" || t === "integer") {
    const n =
      typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n)) {
      return typeof def.default === "number" ? def.default : 0;
    }
    let x = n;
    if (typeof def.minimum === "number") x = Math.max(def.minimum, x);
    if (typeof def.maximum === "number") x = Math.min(def.maximum, x);
    return t === "integer" ? Math.round(x) : x;
  }
  if (t === "string") {
    return raw == null ? "" : String(raw);
  }
  return raw;
}

type SettingsMenuProps = {
  blockId: PipelineBlockId;
  drawerLayout: PipelineDrawerLayoutV1;
  setDrawerLayout: Dispatch<SetStateAction<PipelineDrawerLayoutV1>>;
};

export function PipelineBlockDrawerSettingsMenu({
  blockId,
  drawerLayout,
  setDrawerLayout,
}: SettingsMenuProps) {
  const schema = getPipelineBlockSettingsSchema(blockId);
  const propsList = useMemo(
    () => iterObjectProperties(schema),
    [schema],
  );
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePos = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 220;
    const left = Math.min(
      window.innerWidth - 8 - width,
      Math.max(8, r.right - width),
    );
    setPanelPos({ top: r.bottom + 6, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t))
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const applyKey = useCallback(
    (key: string, def: Readonly<Record<string, unknown>>, value: unknown) => {
      const coerced = coerceFromUi(def, value);
      setDrawerLayout((prev) => {
        const raw = getRawDrawerBlockSettings(prev, blockId);
        const nextBag = { ...raw, [key]: coerced };
        return setDrawerBlockSettings(prev, blockId, nextBag);
      });
    },
    [blockId, setDrawerLayout],
  );

  if (!schema || propsList.length === 0) return null;

  const resolved = resolveDrawerBlockSettings(blockId, drawerLayout);

  const panel =
    open && panelPos && mounted ? (
      <div
        ref={panelRef}
        role="dialog"
        aria-label={`${blockId} block settings`}
        className={cn(
          "fixed rounded-lg border border-border bg-background p-3 shadow-lg",
          "ring-1 ring-black/[0.04] dark:ring-white/[0.06]",
        )}
        style={{
          ...zIndexStyle("modal"),
          top: panelPos.top,
          left: panelPos.left,
          width: panelPos.width,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Block options
        </div>
        <div className="space-y-3">
          {propsList.map(({ key, def }) => {
            const label =
              typeof def.title === "string" && def.title.trim()
                ? def.title
                : humanizePropKey(key);
            const t = def.type;
            const current = resolved[key];

            if (t === "boolean") {
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary/35"
                    checked={Boolean(current)}
                    onChange={(e) =>
                      applyKey(key, def, e.currentTarget.checked)
                    }
                  />
                  <span>{label}</span>
                </label>
              );
            }

            if (t === "number" || t === "integer") {
              return (
                <Label key={key} className="text-xs">
                  {label}
                  <Input
                    type="number"
                    className="mt-1 h-8 text-sm"
                    value={
                      typeof current === "number" && Number.isFinite(current)
                        ? current
                        : ""
                    }
                    min={
                      typeof def.minimum === "number"
                        ? def.minimum
                        : undefined
                    }
                    max={
                      typeof def.maximum === "number"
                        ? def.maximum
                        : undefined
                    }
                    step={t === "integer" ? 1 : "any"}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      if (v === "") return;
                      applyKey(key, def, Number(v));
                    }}
                  />
                </Label>
              );
            }

            if (t === "string") {
              return (
                <Label key={key} className="text-xs">
                  {label}
                  <Input
                    type="text"
                    className="mt-1 h-8 text-sm"
                    value={current == null ? "" : String(current)}
                    onChange={(e) =>
                      applyKey(key, def, e.currentTarget.value)
                    }
                  />
                </Label>
              );
            }

            return null;
          })}
        </div>
      </div>
    ) : null;

  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className={cn(
          "inline-flex touch-manipulation items-center justify-center rounded-md",
          "h-9 w-9 max-sm:h-11 max-sm:w-11 sm:h-7 sm:w-7",
          "text-muted-foreground transition hover:bg-muted/60 hover:text-foreground",
          "active:bg-muted/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Block settings"
        onClick={() => setOpen((o) => !o)}
      >
        <Settings2
          className="h-4 w-4 max-sm:h-[18px] max-sm:w-[18px] sm:h-3.5 sm:w-3.5"
          aria-hidden
        />
      </button>
      {panel && typeof document !== "undefined"
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}

export type DrawerBlockHeaderExtrasProps = {
  blockId: PipelineDrawerSectionId;
  badgeCount: number;
  drawerLayout: PipelineDrawerLayoutV1;
  setDrawerLayout: Dispatch<SetStateAction<PipelineDrawerLayoutV1>>;
  /** When true, field-count badge is easier to read on a collapsed card header. */
  sectionCollapsed?: boolean;
  /** Shown after the badge + settings control (e.g. section actions). */
  trailing?: ReactNode;
};

export const DrawerBlockHeaderExtras = memo(function DrawerBlockHeaderExtras({
  blockId,
  badgeCount,
  drawerLayout,
  setDrawerLayout,
  sectionCollapsed,
  trailing,
}: DrawerBlockHeaderExtrasProps) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-2">
      <span className="inline-flex shrink-0 items-center gap-0.5">
        <SectionFieldCountBadge
          count={badgeCount}
          emphasize={Boolean(sectionCollapsed && badgeCount > 0)}
        />
        <PipelineBlockDrawerSettingsMenu
          blockId={blockId}
          drawerLayout={drawerLayout}
          setDrawerLayout={setDrawerLayout}
        />
      </span>
      {trailing}
    </span>
  );
});
