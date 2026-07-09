"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  Save,
  Shield,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  getGloballyLockedPipelineBlockIds,
  getMandatoryPipelineBlockIds,
  listPipelineBlocks,
  type PipelineBlockDefinition,
  type PipelineBlockId,
} from "@/lib/pipelineBlockRegistry";
import {
  applyPipelineGlobalBlockPolicy,
  getEffectiveMandatoryPipelineBlockIds,
} from "@/lib/pipelineGlobalBlockPolicy";
import {
  PIPELINE_DRAWER_SECTION_LABELS,
  moveSectionInOrder,
  type PipelineDrawerLayoutV1,
} from "@/lib/pipelineDrawerLayoutStorage";
import {
  livePhaseLabel,
  useLiveConnection,
} from "@/lib/useLiveConnection";
import { ADVANCED_PIPELINE_BLOCK_IDS } from "@/lib/orgPlanFeatures";

const lockedGlobal = new Set<string>(getGloballyLockedPipelineBlockIds());
const registryMandatory = new Set<string>(getMandatoryPipelineBlockIds());

type PipelineBlockAdminDashboardProps = {
  /** When both are set, server enforces `blocks.manage` and scopes bulk jobs to this org. */
  rbacOrganizationId?: Id<"organizations">;
  actorUserKey?: string;
};

export function PipelineBlockAdminDashboard({
  rbacOrganizationId,
  actorUserKey,
}: PipelineBlockAdminDashboardProps = {}) {
  const rbacArgs =
    rbacOrganizationId && actorUserKey?.trim()
      ? {
          rbacOrganizationId,
          actorUserKey: actorUserKey.trim(),
        }
      : {};
  const orgEntitlements = useQuery(
    api.organizationPlan.featureEntitlements,
    rbacOrganizationId && actorUserKey?.trim()
      ? {
          organizationId: rbacOrganizationId,
          memberUserKey: actorUserKey.trim(),
        }
      : "skip",
  );
  const hideAdvancedBlocks =
    Boolean(rbacOrganizationId) &&
    orgEntitlements?.advanced_blocks !== true;
  const { canUseHub, phase, reconnectingDetail } = useLiveConnection();
  const resolved = useQuery(api.pipelineGlobalBlockConfig.getResolved, {});
  const patchGlobal = useMutation(api.pipelineGlobalBlockConfig.patch);
  const syncAll = useMutation(
    api.pipelineGlobalBlockConfig.syncNewFileDrawerLayoutToAllPipelineFiles
  );
  const reapplyPolicy = useMutation(
    api.pipelineGlobalBlockConfig.reapplyGlobalPolicyToAllFileDrawerLayouts
  );

  const [local, setLocal] = useState<{
    adminRequired: string[];
    layout: PipelineDrawerLayoutV1;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const [syncPreserveExpanded, setSyncPreserveExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolvedSyncKey = resolved
    ? [
        resolved.updatedAt,
        resolved.hasPersistedRow,
        resolved.adminRequiredBlockIds.join(","),
        resolved.newFileDrawerLayout.order.join(","),
        resolved.newFileDrawerLayout.hidden.join(","),
      ].join("|")
    : "";

  useEffect(() => {
    if (!resolved) return;
    setLocal({
      adminRequired: [...resolved.adminRequiredBlockIds],
      layout: {
        v: 1,
        order: [...resolved.newFileDrawerLayout.order],
        hidden: [...resolved.newFileDrawerLayout.hidden],
        expanded: { ...resolved.newFileDrawerLayout.expanded },
      },
    });
  }, [resolved, resolvedSyncKey]);

  const nonHideable = useMemo(
    () => new Set(getEffectiveMandatoryPipelineBlockIds(local?.adminRequired)),
    [local?.adminRequired]
  );

  const layoutForEditor = useMemo(() => {
    if (!local) return null;
    return applyPipelineGlobalBlockPolicy(local.layout, {
      disabled: new Set(),
      nonHideable,
    });
  }, [local, nonHideable]);

  const blocks = useMemo(() => {
    const all = listPipelineBlocks();
    if (!hideAdvancedBlocks) return all;
    return all.filter((b) => !ADVANCED_PIPELINE_BLOCK_IDS.has(b.blockId));
  }, [hideAdvancedBlocks]);

  const toggleDefaultOnForNewFiles = useCallback(
    (id: PipelineBlockId, enabled: boolean) => {
      setLocal((prev) => {
        if (!prev) return prev;
        const nh = new Set(
          getEffectiveMandatoryPipelineBlockIds(prev.adminRequired)
        );
        if (!enabled) {
          if (lockedGlobal.has(id) || nh.has(id)) return prev;
          const hidden = prev.layout.hidden.includes(id)
            ? prev.layout.hidden
            : [...prev.layout.hidden, id];
          const layout = applyPipelineGlobalBlockPolicy(
            { ...prev.layout, hidden },
            { disabled: new Set(), nonHideable: nh }
          );
          return { ...prev, layout };
        }
        const hidden = prev.layout.hidden.filter((x) => x !== id);
        let order = [...prev.layout.order];
        if (!order.includes(id)) order.push(id);
        const layout = applyPipelineGlobalBlockPolicy(
          { ...prev.layout, order, hidden },
          { disabled: new Set(), nonHideable: nh }
        );
        return { ...prev, layout };
      });
    },
    []
  );

  const toggleAdminRequired = useCallback((id: PipelineBlockId) => {
    if (registryMandatory.has(id)) return;
    setLocal((prev) => {
      if (!prev) return prev;
      const has = prev.adminRequired.includes(id);
      const adminRequired = has
        ? prev.adminRequired.filter((x) => x !== id)
        : [...prev.adminRequired, id];
      const nh = new Set(getEffectiveMandatoryPipelineBlockIds(adminRequired));
      let layout = { ...prev.layout };
      if (!has) {
        layout = {
          ...layout,
          hidden: layout.hidden.filter((x) => x !== id),
        };
      }
      layout = applyPipelineGlobalBlockPolicy(layout, {
        disabled: new Set(),
        nonHideable: nh,
      });
      return { ...prev, adminRequired, layout };
    });
  }, []);

  const setLayout = useCallback(
    (fn: (l: PipelineDrawerLayoutV1) => PipelineDrawerLayoutV1) => {
      setLocal((prev) => {
        if (!prev) return prev;
        const nextLayout = fn(prev.layout);
        return { ...prev, layout: nextLayout };
      });
    },
    []
  );

  const save = async () => {
    if (!local || !process.env.NEXT_PUBLIC_CONVEX_URL || !canUseHub) return;
    setSaving(true);
    setError(null);
    try {
      const coerced = applyPipelineGlobalBlockPolicy(local.layout, {
        disabled: new Set(),
        nonHideable,
      });
      await patchGlobal({
        disabledBlockIds: [],
        adminRequiredBlockIds: local.adminRequired.filter(
          (id) => !registryMandatory.has(id)
        ),
        newFileDrawerLayout: {
          v: 1,
          order: coerced.order,
          hidden: coerced.hidden,
          expanded: coerced.expanded,
        },
        ...rbacArgs,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runSync = async () => {
    if (!process.env.NEXT_PUBLIC_CONVEX_URL || !canUseHub) return;
    setSyncing(true);
    setError(null);
    try {
      await syncAll({
        preservePerFileExpanded: syncPreserveExpanded,
        ...rbacArgs,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const runReapply = async () => {
    if (!process.env.NEXT_PUBLIC_CONVEX_URL || !canUseHub) return;
    setReapplying(true);
    setError(null);
    try {
      await reapplyPolicy({ ...rbacArgs });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-apply failed");
    } finally {
      setReapplying(false);
    }
  };

  if (resolved === undefined || local === null || layoutForEditor === null) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading pipeline admin…
      </p>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium text-foreground">
              Block management (new files)
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Stored centrally in{" "}
              <span className="font-mono text-[11px]">pipelineGlobalBlockConfig</span>.
              Changes apply to <strong>new pipeline files</strong> when they are
              created — existing files keep their own saved drawer until you use an
              explicit sync action below.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {!canUseHub ? (
        <div
          className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground"
          role="status"
        >
          <p className="font-medium">{livePhaseLabel(phase)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Saving or syncing needs an active Convex connection.
            {reconnectingDetail ? ` ${reconnectingDetail}` : ""}
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border/80">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Block</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium text-center">
                On by default (new files)
              </th>
              <th className="px-3 py-2 font-medium text-center">Required</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b: PipelineBlockDefinition) => {
              const defaultOn =
                layoutForEditor.order.includes(b.blockId) &&
                !layoutForEditor.hidden.includes(b.blockId);
              const required =
                b.isMandatory || local.adminRequired.includes(b.blockId);
              const lockDefault = lockedGlobal.has(b.blockId);
              return (
                <tr
                  key={b.blockId}
                  className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{b.label}</div>
                    {b.description ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {b.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                    {b.category}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <label className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-[rgb(var(--primary))]"
                        checked={defaultOn}
                        disabled={lockDefault}
                        onChange={(e) =>
                          toggleDefaultOnForNewFiles(b.blockId, e.target.checked)
                        }
                        aria-label={`Include ${b.label} by default in new files`}
                      />
                      {lockDefault ? (
                        <Lock
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden
                        />
                      ) : null}
                    </label>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <label className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-[rgb(var(--primary))]"
                        checked={required}
                        disabled={b.isMandatory}
                        onChange={() => toggleAdminRequired(b.blockId)}
                        aria-label={`Require ${b.label} for new files (cannot hide)`}
                      />
                      {b.isMandatory ? (
                        <Lock
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden
                        />
                      ) : null}
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
        <h3 className="text-sm font-semibold text-foreground">
          Default drawer order (new files)
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Blocks that are off by default stay in this list (dimmed) so you can turn
          them back on or reorder before saving.
        </p>
        <ul className="mt-3 max-h-[min(50dvh,22rem)] space-y-1 overflow-y-auto pr-1">
          {layoutForEditor.order.map((id) => {
            const hidden = layoutForEditor.hidden.includes(id);
            return (
              <li
                key={id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background px-2 py-1.5 sm:flex-nowrap",
                  hidden && "opacity-60"
                )}
              >
                <span className="min-w-0 flex-1 text-xs font-medium text-foreground">
                  {PIPELINE_DRAWER_SECTION_LABELS[id]}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 px-0"
                    title="Move up"
                    aria-label={`Move ${PIPELINE_DRAWER_SECTION_LABELS[id]} up`}
                    onClick={() =>
                      setLayout((l) => ({
                        ...l,
                        order: moveSectionInOrder(l.order, id, -1),
                      }))
                    }
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 px-0"
                    title="Move down"
                    aria-label={`Move ${PIPELINE_DRAWER_SECTION_LABELS[id]} down`}
                    onClick={() =>
                      setLayout((l) => ({
                        ...l,
                        order: moveSectionInOrder(l.order, id, 1),
                      }))
                    }
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 px-0"
                    title={hidden ? "On by default" : "Off by default"}
                    disabled={nonHideable.has(id)}
                    aria-label={
                      hidden
                        ? `Turn on by default ${PIPELINE_DRAWER_SECTION_LABELS[id]}`
                        : `Turn off by default ${PIPELINE_DRAWER_SECTION_LABELS[id]}`
                    }
                    onClick={() =>
                      setLayout((l) => {
                        const isHidden = l.hidden.includes(id);
                        return {
                          ...l,
                          hidden: isHidden
                            ? l.hidden.filter((x) => x !== id)
                            : [...l.hidden, id],
                        };
                      })
                    }
                  >
                    {hidden ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={saving || !process.env.NEXT_PUBLIC_CONVEX_URL || !canUseHub}
          onClick={() => void save()}
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save new-file defaults"}
        </Button>
      </div>

      <div className="space-y-3 rounded-xl border border-amber-500/35 bg-amber-500/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <h3 className="text-sm font-semibold text-foreground">
            Optional: apply to existing files
          </h3>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong>Push template</strong> overwrites each existing file&apos;s saved
          drawer layout with the <strong>new-file default</strong> above.{" "}
          <strong>Re-apply rules only</strong> normalizes each file&apos;s layout
          (e.g. strips invalid hidden states) without adopting the full template.
          Nothing here runs automatically when you save defaults.
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-[rgb(var(--primary))]"
            checked={syncPreserveExpanded}
            onChange={(e) => setSyncPreserveExpanded(e.target.checked)}
          />
          When pushing template, preserve per-file expanded/collapsed where block ids
          still exist
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={syncing || !process.env.NEXT_PUBLIC_CONVEX_URL || !canUseHub}
            onClick={() => void runSync()}
          >
            <RefreshCw className="h-4 w-4" />
            {syncing ? "Syncing…" : "Push template to all files"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={reapplying || !process.env.NEXT_PUBLIC_CONVEX_URL || !canUseHub}
            onClick={() => void runReapply()}
          >
            {reapplying ? "Working…" : "Re-apply rules only"}
          </Button>
        </div>
      </div>

      {!resolved.hasPersistedRow ? (
        <p className="text-xs text-muted-foreground">
          No global row saved yet — defaults match the built-in registry until you
          save.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Last updated{" "}
          {resolved.updatedAt
            ? new Date(resolved.updatedAt).toLocaleString()
            : "—"}
        </p>
      )}
    </div>
  );
}
