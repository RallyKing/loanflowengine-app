"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  NAV_CATALOG,
  NAV_ICON_KEYS,
  isNavIconKey,
  type NavCatalogEntry,
  type NavIconKey,
} from "@/lib/navigation/navigationCatalog";
import {
  isActivePath,
  isPipelineZonePath,
} from "@/lib/navigation/navPathUtils";
import { navIconForKey } from "@/lib/navigation/navIcons";
import { pickMobileBottomItems } from "@/lib/navigation/mobileBottomSlots";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useAuth } from "@/lib/sessionUiClient";
import {
  buildResponsiveNavRegistry,
} from "@/lib/navigation/responsiveNavRegistry";
import {
  NAV_BREAKPOINT_MD,
  NAV_BREAKPOINT_XL,
} from "@/lib/navigation/responsiveNavConstants";
import { useNavigationConfig } from "@/components/navigation/NavigationConfigProvider";
import { useResponsiveNav } from "@/components/navigation/ResponsiveNavProvider";
import {
  catalogEntryById,
  navigationPresetHiddenIds,
  type NavigationPreset,
  type NavItemOverride,
  type NavQuickAction,
  type ResolvedNavigationConfig,
} from "@/lib/navigation/navigationResolve";

const MANAGE_IDS = NAV_CATALOG.filter((e) => e.id !== "settings").map(
  (e) => e.id,
);

const TABLET_STRIP_IDS = [
  "pipeline",
  "tasks",
  "contacts",
  "lenders",
  "activity",
] as const;

function buildOrderedIds(cfg: ResolvedNavigationConfig): string[] {
  const omap = new Map(cfg.overrides.map((o) => [o.id, o]));
  return [...MANAGE_IDS].sort((a, b) => {
    const oa = omap.get(a)?.order ?? catalogEntryById(a)?.order ?? 0;
    const ob = omap.get(b)?.order ?? catalogEntryById(b)?.order ?? 0;
    if (oa !== ob) return oa - ob;
    return MANAGE_IDS.indexOf(a) - MANAGE_IDS.indexOf(b);
  });
}

function overridesFromOrdered(
  orderedIds: string[],
  cfg: ResolvedNavigationConfig,
): NavItemOverride[] {
  const prev = new Map(cfg.overrides.map((o) => [o.id, o]));
  const forced = navigationPresetHiddenIds(cfg.preset);
  return orderedIds.map((id, i) => {
    const o: NavItemOverride = { id, order: (i + 1) * 10 };
    const p = prev.get(id);
    if (forced.has(id)) o.visible = false;
    else if (p?.visible === false) o.visible = false;
    if (p?.iconKey) o.iconKey = p.iconKey;
    if (p?.pinned) o.pinned = true;
    return o;
  });
}

function NavPreviewChips({
  items,
  pathnameMock,
}: {
  items: NavCatalogEntry[];
  pathnameMock: string;
}) {
  const show = items.filter((e) => e.id !== "settings").slice(0, 10);
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1 border border-border/60 bg-muted/20 px-2 py-1.5">
      {show.map((e) => {
        const Icon = navIconForKey(e.iconKey);
        const active = e.pipelineGroup
          ? isPipelineZonePath(pathnameMock)
          : isActivePath(pathnameMock, e.href);
        return (
          <span
            key={e.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              active
                ? "bg-primary/15 text-primary"
                : "bg-background text-muted-foreground",
            )}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden />
            {e.label}
          </span>
        );
      })}
    </div>
  );
}

function SortableNavRow({
  id,
  children,
  disabled,
}: {
  id: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2 py-2",
        isDragging && "z-10 shadow-md",
        disabled && "opacity-60",
      )}
    >
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40"
        aria-label="Reorder"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function NavigationManagerPanel() {
  const {
    config,
    replaceConfig,
    persistRemote,
    setPreset,
    ready,
    orgPolicy,
    setQuickActions,
    setSyncScope,
    setNavLayoutMode,
    resetToDefaults,
    globalAdminNavEditAccountId,
    setGlobalAdminNavEditAccountId,
    isGlobalAdmin: navCtxGlobalAdmin,
  } = useNavigationConfig();
  const { tabletBottomNavEnabled, setTabletBottomNavEnabled, layout } =
    useResponsiveNav();
  const { isGlobalAdmin: sessionGlobalAdmin, userId } = useAuth();
  const globalAdmin =
    sessionGlobalAdmin && navCtxGlobalAdmin && Boolean(userId);
  const navAccounts = useQuery(
    api.navigationUserConfig.listAccountsForGlobalNavAdmin,
    globalAdmin && userId ? { memberUserKey: userId } : "skip",
  );
  const { activeOrganizationId, effective, can: orgCan } = useOrgPermissions();
  const memberUserKey = useActorUserKey();
  const upsertOrgPolicy = useMutation(
    api.navigationUserConfig.upsertOrgNavigationPolicy,
  );

  const [orderedIds, setOrderedIds] = useState<string[]>(MANAGE_IDS);
  const [saving, setSaving] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyVisible, setPolicyVisible] = useState<string[]>([]);
  const [policyHidden, setPolicyHidden] = useState<string[]>([]);

  useEffect(() => {
    setOrderedIds(buildOrderedIds(config));
  }, [config]);

  useEffect(() => {
    if (!orgPolicy) {
      setPolicyVisible([]);
      setPolicyHidden([]);
      return;
    }
    setPolicyVisible([...orgPolicy.enforcedVisibleIds]);
    setPolicyHidden([...orgPolicy.enforcedHiddenIds]);
  }, [orgPolicy]);

  const forcedHidden = useMemo(
    () => navigationPresetHiddenIds(config.preset),
    [config.preset],
  );

  const previewCfg = config;
  const granted = effective?.permissions ?? null;
  const previewRegistry = useMemo(
    () =>
      buildResponsiveNavRegistry({
        config: previewCfg,
        grantedPermissions: granted,
        orgPolicy,
        recency: null,
      }),
    [previewCfg, granted, orgPolicy],
  );
  const previewItems = previewRegistry.primaryNav;

  const mobilePreviewItems = useMemo(
    () => pickMobileBottomItems(previewItems),
    [previewItems],
  );

  const tabletPreviewItems = useMemo(() => {
    const m = new Map(previewItems.map((e) => [e.id, e]));
    return TABLET_STRIP_IDS.map((id) => m.get(id)).filter(
      (e): e is NonNullable<typeof e> => e != null,
    );
  }, [previewItems]);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const oldIdx = orderedIds.indexOf(String(active.id));
      const newIdx = orderedIds.indexOf(String(over.id));
      if (oldIdx < 0 || newIdx < 0) return;
      const nextOrder = arrayMove(orderedIds, oldIdx, newIdx);
      setOrderedIds(nextOrder);
      replaceConfig({
        ...config,
        overrides: overridesFromOrdered(nextOrder, config),
      });
    },
    [orderedIds, config, replaceConfig],
  );

  const toggleVisible = useCallback(
    (id: string, checked: boolean) => {
      if (forcedHidden.has(id)) return;
      if (orgPolicy?.enforcedVisibleIds.has(id)) return;
      const base = overridesFromOrdered(orderedIds, config);
      const next = base.map((o) =>
        o.id === id
          ? { ...o, visible: checked ? undefined : false }
          : o,
      );
      replaceConfig({ ...config, overrides: next });
    },
    [orderedIds, config, replaceConfig, forcedHidden, orgPolicy],
  );

  const togglePinned = useCallback(
    (id: string) => {
      const base = overridesFromOrdered(orderedIds, config);
      const next = base.map((o) => {
        if (o.id !== id) return o;
        return { ...o, pinned: !o.pinned };
      });
      replaceConfig({ ...config, overrides: next });
    },
    [orderedIds, config, replaceConfig],
  );

  const setIconOverride = useCallback(
    (id: string, key: NavIconKey) => {
      const cat = catalogEntryById(id);
      const base = overridesFromOrdered(orderedIds, config);
      const next = base.map((o) => {
        if (o.id !== id) return o;
        if (cat && key === cat.iconKey) {
          const { iconKey: _, ...rest } = o;
          return rest;
        }
        return { ...o, iconKey: key };
      });
      replaceConfig({ ...config, overrides: next });
    },
    [orderedIds, config, replaceConfig],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const saveRemote = useCallback(async () => {
    setSaving(true);
    try {
      await persistRemote();
    } finally {
      setSaving(false);
    }
  }, [persistRemote]);

  const addQuickActionFromCatalog = useCallback(
    (catalogId: string) => {
      const e = catalogEntryById(catalogId);
      if (!e) return;
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `qa-${Date.now()}`;
      const qa = config.quickActions ?? [];
      setQuickActions([
        ...qa,
        {
          id,
          label: e.label,
          href: e.href,
          catalogId: e.id,
          iconKey: e.iconKey,
          order: (qa.length + 1) * 10,
        },
      ]);
    },
    [config.quickActions, setQuickActions],
  );

  const removeQuickAction = useCallback(
    (qaId: string) => {
      setQuickActions(
        (config.quickActions ?? []).filter((q) => q.id !== qaId),
      );
    },
    [config.quickActions, setQuickActions],
  );

  const saveOrgPolicy = useCallback(async () => {
    if (!activeOrganizationId) return;
    setSavingPolicy(true);
    try {
      await upsertOrgPolicy({
        organizationId: activeOrganizationId as Id<"organizations">,
        memberUserKey,
        enforcedVisibleIds: policyVisible,
        enforcedHiddenIds: policyHidden,
      });
    } finally {
      setSavingPolicy(false);
    }
  }, [
    activeOrganizationId,
    memberUserKey,
    policyVisible,
    policyHidden,
    upsertOrgPolicy,
  ]);

  const isRowChecked = (id: string) => {
    if (forcedHidden.has(id)) return false;
    if (orgPolicy?.enforcedVisibleIds.has(id)) return true;
    return previewRegistry.primaryNav.some((e) => e.id === id);
  };

  return (
    <div className="space-y-6">
      {globalAdmin ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">
            System admin — navigation profile
          </p>
          <p className="text-xs text-muted-foreground">
            Choose an account to load and save navigation JSON for that user.
            Your own sidebar stays unchanged until you clear the selection.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="nav-admin-account" className="sr-only">
              Edit navigation for account
            </label>
            <Select
              id="nav-admin-account"
              className="min-w-[14rem] flex-1 sm:max-w-md"
              value={globalAdminNavEditAccountId ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                setGlobalAdminNavEditAccountId(v ? v : null);
              }}
            >
              <option value="">— My account ({memberUserKey.slice(0, 8)}…) —</option>
              {(navAccounts ?? []).map((u) => (
                <option key={u.accountId} value={u.accountId}>
                  {u.displayUsername}
                  {u.email ? ` · ${u.email}` : ""}
                </option>
              ))}
            </Select>
            {globalAdminNavEditAccountId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setGlobalAdminNavEditAccountId(null)}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-md space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="nav-preset"
          >
            Role preset
          </label>
          <Select
            id="nav-preset"
            value={config.preset}
            onChange={(e) => setPreset(e.target.value as NavigationPreset)}
            className="w-full"
            disabled={!ready}
          >
            <option value="admin">Admin (all primary routes)</option>
            <option value="analyst">Analyst</option>
            <option value="viewer">Viewer (fewer tools)</option>
            <option value="sales">Sales (pipeline + CRM focus)</option>
            <option value="processor">Processor (execution queues)</option>
            <option value="manager">Manager (command + timeline)</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            Viewer hides documents and analytics by default. You can still
            reorder items below; hidden routes stay out of the shell.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void saveRemote()}
            disabled={!ready || saving || config.syncScope === "device"}
          >
            {saving
              ? "Saving…"
              : globalAdminNavEditAccountId
                ? "Save to selected account"
                : "Save to account"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => resetToDefaults()}
            disabled={!ready}
          >
            Reset to defaults
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="nav-sync-scope"
          >
            Persistence
          </label>
          <Select
            id="nav-sync-scope"
            value={config.syncScope ?? "cloud"}
            onChange={(e) =>
              setSyncScope(e.target.value as "cloud" | "device")
            }
            className="w-full"
          >
            <option value="cloud">Cloud — sync layout to this account</option>
            <option value="device">Device only — stay on this browser</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            Device mode skips &quot;Save to account&quot; for navigation JSON
            (presets may still follow the server).
          </p>
        </div>
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="nav-layout-mode"
          >
            Sidebar density
          </label>
          <Select
            id="nav-layout-mode"
            value={config.navLayoutMode ?? "expanded"}
            onChange={(e) =>
              setNavLayoutMode(e.target.value as "compact" | "expanded")
            }
            className="w-full"
          >
            <option value="expanded">Expanded</option>
            <option value="compact">Compact</option>
          </Select>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">
          Quick actions
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          Shortcuts shown in the workspace sidebar (filtered by your permissions).
        </p>
        <div className="mb-3 flex max-w-md flex-wrap gap-2">
          <Select
            key={(config.quickActions ?? []).length}
            aria-label="Add quick action from route"
            className="min-w-[12rem] flex-1 text-sm"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              e.target.value = "";
              addQuickActionFromCatalog(v);
            }}
          >
            <option value="">Add from catalog…</option>
            {MANAGE_IDS.map((id) => (
              <option key={id} value={id}>
                {catalogEntryById(id)?.label ?? id}
              </option>
            ))}
          </Select>
        </div>
        <ul className="space-y-2" role="list">
          {(config.quickActions ?? []).map((q) => (
            <li
              key={q.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {q.label}{" "}
                <span className="font-normal text-muted-foreground">
                  ({q.href})
                </span>
              </span>
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${q.label}`}
                onClick={() => removeQuickAction(q.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {orgCan("org.roles.manage") && activeOrganizationId ? (
        <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              Organization policy
            </p>
            <p className="text-xs text-muted-foreground">
              Require routes to stay visible or hide them for all members.
              Changing this requires the{" "}
              <span className="font-medium">org.roles.manage</span> permission.
            </p>
          </div>
          <ul className="space-y-1" role="list">
            {MANAGE_IDS.map((id) => {
              const entry = catalogEntryById(id);
              if (!entry) return null;
              const v = policyVisible.includes(id);
              const h = policyHidden.includes(id);
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center gap-3 text-sm"
                >
                  <span className="min-w-[7rem] font-medium">{entry.label}</span>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-border"
                      checked={v}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setPolicyVisible((x) => [...new Set([...x, id])]);
                          setPolicyHidden((y) => y.filter((z) => z !== id));
                        } else {
                          setPolicyVisible((x) => x.filter((z) => z !== id));
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground">Force visible</span>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-border"
                      checked={h}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setPolicyHidden((x) => [...new Set([...x, id])]);
                          setPolicyVisible((y) => y.filter((z) => z !== id));
                        } else {
                          setPolicyHidden((x) => x.filter((z) => z !== id));
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground">Hide org-wide</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            size="sm"
            disabled={savingPolicy || !activeOrganizationId}
            onClick={() => void saveOrgPolicy()}
          >
            {savingPolicy ? "Saving policy…" : "Save organization policy"}
          </Button>
        </div>
      ) : null}

      <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-border accent-[rgb(var(--primary))] focus-visible:ring-2 focus-visible:ring-brand-accent"
            checked={tabletBottomNavEnabled}
            onChange={(e) => setTabletBottomNavEnabled(e.target.checked)}
            aria-describedby="nav-tablet-bottom-help"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">
              Tablet bottom navigation
            </span>
            <span
              id="nav-tablet-bottom-help"
              className="mt-0.5 block text-xs text-muted-foreground"
            >
              Adds the thumb-primary bar between roughly tablet widths (
              {NAV_BREAKPOINT_MD}px–{NAV_BREAKPOINT_XL - 1}px) in addition to the
              rail / sidebar. The compact header strip is hidden while this is on
              to avoid duplicate shortcuts. Saved locally on this device (
              {layout.shell === "tablet" ? "current layout: tablet" : `current: ${layout.shell}`}
              ).
            </span>
          </span>
        </label>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Preview</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Preview mode: chips use your current editor state, role permissions, and
          organization policy — same merge as the live shell (without mounting a
          second scroll container).
        </p>
        <div className="grid gap-3 lg:grid-cols-3">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Mobile bar
            </p>
            <NavPreviewChips
              items={mobilePreviewItems}
              pathnameMock="/tasks"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tablet strip
            </p>
            <NavPreviewChips
              items={tabletPreviewItems}
              pathnameMock="/pipeline"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sidebar order
            </p>
            <NavPreviewChips items={previewItems} pathnameMock="/contacts" />
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">
          Order & visibility
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={orderedIds}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2" role="list">
              {orderedIds.map((id) => {
                const entry = catalogEntryById(id);
                if (!entry) return null;
                const locked = forcedHidden.has(id);
                const orgLocks = orgPolicy?.enforcedVisibleIds.has(id) ?? false;
                const checked = isRowChecked(id);
                const ov = config.overrides.find((o) => o.id === id);
                const pinned = ov?.pinned ?? false;
                const iconVal =
                  ov?.iconKey && isNavIconKey(ov.iconKey)
                    ? ov.iconKey
                    : entry.iconKey;

                return (
                  <li key={id}>
                    <SortableNavRow id={id} disabled={false}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border accent-[rgb(var(--primary))] focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-50"
                              checked={checked}
                              disabled={locked || orgLocks}
                              onChange={(e) =>
                                toggleVisible(id, e.target.checked)
                              }
                              aria-label={`Show ${entry.label} in navigation`}
                            />
                            <span className="truncate">{entry.label}</span>
                          </label>
                          {orgLocks ? (
                            <span className="text-[10px] text-muted-foreground">
                              (org)
                            </span>
                          ) : null}
                          {locked ? (
                            <span className="text-[10px] text-muted-foreground">
                              (preset)
                            </span>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            className={cn(
                              "rounded-md p-2 text-muted-foreground hover:bg-muted",
                              pinned && "text-brand-accent",
                            )}
                            aria-label={
                              pinned ? "Unpin favorite" : "Pin favorite"
                            }
                            aria-pressed={pinned}
                            onClick={() => togglePinned(id)}
                          >
                            <Pin
                              className={cn(
                                "h-4 w-4",
                                pinned && "fill-current",
                              )}
                              aria-hidden
                            />
                          </button>
                          <label className="sr-only" htmlFor={`icon-${id}`}>
                            Icon for {entry.label}
                          </label>
                          <Select
                            id={`icon-${id}`}
                            value={iconVal}
                            onChange={(e) =>
                              setIconOverride(id, e.target.value as NavIconKey)
                            }
                            className="w-36 text-xs"
                            disabled={locked}
                          >
                            {NAV_ICON_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    </SortableNavRow>
                  </li>
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
