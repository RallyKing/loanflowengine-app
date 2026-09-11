"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Settings2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  RecordInspectorBody,
  RecordInspectorFooter,
  RecordInspectorHeader,
  RecordInspectorShell,
  RecordInspectorSubtitle,
} from "@/components/RecordInspectorShell";
import { cn } from "@/lib/cn";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { TaskTemplateManager } from "@/components/library/TaskTemplateManager";
import { DocumentVaultExplorerStarButton } from "@/components/library/DocumentVaultExplorerStarButton";
import {
  sortIndividualTemplatesByFavorites,
  templateStackLabel,
} from "@/lib/library/partitionDocumentTaskTemplates";
import {
  readCachedTemplateFavoriteIds,
  writeCachedTemplateFavoriteIds,
} from "@/lib/library/documentTaskTemplateFavoritesCache";

export type DocumentVaultApplyTemplateDrawerProps = {
  open: boolean;
  onClose: () => void;
  organizationId: Id<"organizations">;
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  onSuccess?: (created: number) => void;
  onError: (message: string) => void;
};

type TabId = "stacks" | "individual";

export function DocumentVaultApplyTemplateDrawer({
  open,
  onClose,
  organizationId,
  pipelineFileId,
  memberUserKey,
  onSuccess,
  onError,
}: DocumentVaultApplyTemplateDrawerProps) {
  const [tab, setTab] = useState<TabId>("stacks");
  const [selectedStacks, setSelectedStacks] = useState<Set<string>>(new Set());
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(
    new Set(),
  );
  const [busy, setBusy] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);

  const seedStarter = useMutation(api.seedTemplates.seedDocumentTaskTemplates);
  const seedLegacy = useMutation(api.documentTaskTemplates.seedStarterTemplates);
  const inject = useMutation(api.documentTaskTemplates.injectTemplates);
  const toggleFavorite = useMutation(api.documentTaskTemplateFavorites.toggle);

  const library = useQuery(
    api.documentTaskTemplates.listStacksWithTemplates,
    open && organizationId
      ? memberUserKey
        ? { organizationId, memberUserKey }
        : { organizationId }
      : "skip",
  );

  const serverFavorites = useQuery(
    api.documentTaskTemplateFavorites.listForOrg,
    open && organizationId && memberUserKey
      ? { organizationId, memberUserKey }
      : "skip",
  );

  useEffect(() => {
    if (!open || !organizationId || !memberUserKey) return;
    void seedStarter({ organizationId, memberUserKey }).catch(() => {
      void seedLegacy({ organizationId, memberUserKey }).catch(() => {
        /* non-blocking */
      });
    });
  }, [open, organizationId, memberUserKey, seedStarter, seedLegacy]);

  // Seed optimistic cache on open; prefer server when it arrives.
  // Skip while a toggle is in flight so a stale query snapshot cannot wipe it.
  useEffect(() => {
    if (!open || !organizationId || !memberUserKey) return;
    if (favoriteBusyId) return;
    if (serverFavorites) {
      const ids = serverFavorites.templateIds.map(String);
      setFavoriteIds(new Set(ids));
      writeCachedTemplateFavoriteIds(String(organizationId), memberUserKey, ids);
      return;
    }
    const cached = readCachedTemplateFavoriteIds(
      String(organizationId),
      memberUserKey,
    );
    if (cached.length > 0) {
      setFavoriteIds(new Set(cached));
    }
  }, [open, organizationId, memberUserKey, serverFavorites, favoriteBusyId]);

  const individualSorted = useMemo(() => {
    if (!library) return [];
    return sortIndividualTemplatesByFavorites(
      library.individualTemplates,
      favoriteIds,
    );
  }, [library, favoriteIds]);

  const toggleStack = (id: string) => {
    setSelectedStacks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTemplate = (id: string) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleFavorite = async (templateId: string) => {
    if (!memberUserKey || favoriteBusyId) return;
    const wasFavorite = favoriteIds.has(templateId);
    const next = new Set(favoriteIds);
    if (wasFavorite) next.delete(templateId);
    else next.add(templateId);
    setFavoriteIds(next);
    writeCachedTemplateFavoriteIds(
      String(organizationId),
      memberUserKey,
      next,
    );
    setFavoriteBusyId(templateId);
    try {
      await toggleFavorite({
        organizationId,
        templateId: templateId as Id<"documentTaskTemplates">,
        memberUserKey,
      });
    } catch (e) {
      setFavoriteIds(favoriteIds);
      writeCachedTemplateFavoriteIds(
        String(organizationId),
        memberUserKey,
        favoriteIds,
      );
      const message =
        e instanceof Error ? e.message : "Could not update favorite.";
      onError(message);
      showOperationalToast({
        title: "Favorite failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setFavoriteBusyId(null);
    }
  };

  const handleInject = async () => {
    if (!memberUserKey || busy) return;
    setBusy(true);
    try {
      const stackIds = [...selectedStacks].map(
        (id) => id as Id<"documentTaskTemplateStacks">,
      );
      const templateIds = [...selectedTemplates].map(
        (id) => id as Id<"documentTaskTemplates">,
      );
      const result = await inject({
        pipelineFileId,
        stackIds: tab === "stacks" ? stackIds : undefined,
        templateIds: tab === "individual" ? templateIds : undefined,
        memberUserKey,
      });
      setSelectedStacks(new Set());
      setSelectedTemplates(new Set());
      onSuccess?.(result.created);
      showOperationalToast({
        title: "Templates injected",
        description: `${result.created} file task(s) added.`,
      });
      onClose();
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Template injection failed. If this persists, run `npx convex deploy` to sync the backend.";
      onError(message);
      showOperationalToast({
        title: "Inject failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const canInject =
    tab === "stacks"
      ? selectedStacks.size > 0
      : selectedTemplates.size > 0;

  if (!open) return null;

  return (
    <>
    <RecordInspectorShell
      onClose={onClose}
      recordKind="document"
      ariaLabel="Apply template"
      panelClassName="md:max-w-md"
    >
      <RecordInspectorHeader id="apply-template-title">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">
              Apply Template
            </h2>
            <RecordInspectorSubtitle>
              Choose a template stack or individual tasks, then inject into the active
              pipeline file.
            </RecordInspectorSubtitle>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            aria-label="Manage templates"
            onClick={() => setManageOpen(true)}
          >
            <Settings2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </RecordInspectorHeader>
      <RecordInspectorBody className="space-y-4">
        <div
          className="flex gap-1 rounded-dlc-md border border-border/70 p-0.5"
          role="tablist"
          aria-label="Apply template source"
        >
          {(["stacks", "individual"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-testid={
                id === "stacks"
                  ? "apply-template-tab-stacks"
                  : "apply-template-tab-individual"
              }
              className={cn(
                "flex-1 rounded-dlc-sm px-2 py-1.5 text-xs font-medium transition-colors",
                tab === id
                  ? "bg-dlc-surface-high text-foreground shadow-dlc-1"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab(id)}
            >
              {id === "stacks" ? "Template Stacks" : "Individual Tasks"}
            </button>
          ))}
        </div>

        {library === undefined ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          </div>
        ) : tab === "stacks" ? (
          <ul className="space-y-2" data-testid="apply-template-stacks-list">
            {library.stacks.length === 0 ? (
              <li className="text-xs text-muted-foreground">
                No template stacks yet.
              </li>
            ) : (
              library.stacks.map((stack) => (
                <li key={stack._id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-dlc-md border border-border/60 px-3 py-2 hover:bg-muted/30">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selectedStacks.has(String(stack._id))}
                      onChange={() => toggleStack(String(stack._id))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {stack.name}
                      </span>
                      {stack.description ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {stack.description} · {stack.templates.length} tasks
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {stack.templates.length} tasks
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
        ) : (
          <ul className="space-y-1" data-testid="apply-template-individual-list">
            {individualSorted.length === 0 ? (
              <li className="text-xs text-muted-foreground">
                No task templates yet. Add templates in Manage Templates.
              </li>
            ) : (
              individualSorted.map((tpl, index) => {
                const id = String(tpl._id);
                const isFavorite = favoriteIds.has(id);
                const prevIsFavorite =
                  index > 0 &&
                  favoriteIds.has(String(individualSorted[index - 1]!._id));
                const showFavoritesHeader = isFavorite && index === 0;
                const showLibraryDivider = !isFavorite && (index === 0 || prevIsFavorite);
                const stackLabel = templateStackLabel(
                  tpl.stackId ? String(tpl.stackId) : undefined,
                  library.stacks,
                );
                return (
                  <li key={tpl._id}>
                    {showFavoritesHeader ? (
                      <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Favorites
                      </div>
                    ) : null}
                    {showLibraryDivider ? (
                      <div className="mb-1 mt-2 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        All tasks
                      </div>
                    ) : null}
                    <div className="flex items-center gap-1 rounded-dlc-sm px-2 py-1.5 hover:bg-muted/30">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedTemplates.has(id)}
                          onChange={() => toggleTemplate(id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">{tpl.title}</span>
                          {stackLabel ? (
                            <span className="block text-[10px] text-muted-foreground">
                              In stack: {stackLabel}
                            </span>
                          ) : (
                            <span className="block text-[10px] text-muted-foreground">
                              Standalone
                            </span>
                          )}
                        </span>
                        {(tpl.clientTemplateAttachments?.length ?? 0) > 0 ? (
                          <span className="text-[10px] text-muted-foreground">
                            Template file
                            {tpl.clientTemplateAttachments!.length === 1
                              ? ""
                              : "s"}
                          </span>
                        ) : null}
                        {tpl.isRequired ? (
                          <span className="text-[10px] text-amber-700">
                            Required
                          </span>
                        ) : null}
                      </label>
                      <DocumentVaultExplorerStarButton
                        starred={isFavorite}
                        label={tpl.title}
                        disabled={!memberUserKey || favoriteBusyId === id}
                        onToggle={() => void handleToggleFavorite(id)}
                        testId={`apply-template-favorite-${id}`}
                      />
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </RecordInspectorBody>
      <RecordInspectorFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!canInject || busy}
          onClick={() => void handleInject()}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            "Inject"
          )}
        </Button>
      </RecordInspectorFooter>
    </RecordInspectorShell>
    <TaskTemplateManager
      open={manageOpen}
      onClose={() => setManageOpen(false)}
      organizationId={organizationId}
      memberUserKey={memberUserKey}
      onError={onError}
    />
    </>
  );
}
