"use client";

import { useEffect, useState } from "react";
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

  const seedStarter = useMutation(api.seedTemplates.seedDocumentTaskTemplates);
  const seedLegacy = useMutation(api.documentTaskTemplates.seedStarterTemplates);
  const inject = useMutation(api.documentTaskTemplates.injectTemplates);

  const library = useQuery(
    api.documentTaskTemplates.listStacksWithTemplates,
    open && organizationId
      ? memberUserKey
        ? { organizationId, memberUserKey }
        : { organizationId }
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
        <div className="flex gap-1 rounded-dlc-md border border-border/70 p-0.5">
          {(["stacks", "individual"] as const).map((id) => (
            <button
              key={id}
              type="button"
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
          <ul className="space-y-2">
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
          <ul className="space-y-1">
            {library.individualTemplates.length === 0 ? (
              <li className="text-xs text-muted-foreground">
                No individual templates. Use stacks or add templates in settings.
              </li>
            ) : (
              library.individualTemplates.map((tpl) => (
                <li key={tpl._id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-dlc-sm px-2 py-1.5 hover:bg-muted/30">
                    <input
                      type="checkbox"
                      checked={selectedTemplates.has(String(tpl._id))}
                      onChange={() => toggleTemplate(String(tpl._id))}
                    />
                    <span className="text-sm">{tpl.title}</span>
                    {tpl.isRequired ? (
                      <span className="text-[10px] text-amber-700">Required</span>
                    ) : null}
                  </label>
                </li>
              ))
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
