"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BookOpen, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ActionSuiteModal } from "@/components/ui/ActionSuite";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export function TaskTemplateApplyModal({
  organizationId,
  memberUserKey,
  pipelineFileId,
  actorUserKey,
  onClose,
  onApplied,
}: {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  pipelineFileId: Id<"pipeline">;
  actorUserKey?: string;
  onClose: () => void;
  onApplied?: (result: { count: number; groupName: string }) => void;
}) {
  const groups =
    useQuery(api.taskTemplateLibrary.listTemplateGroups, {
      organizationId,
      memberUserKey,
    }) ?? [];
  const applyGroup = useMutation(
    api.taskTemplateLibrary.applyTemplateGroupToFile,
  );
  const [applyingId, setApplyingId] =
    useState<Id<"taskTemplateGroups"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async (groupId: Id<"taskTemplateGroups">) => {
    setApplyingId(groupId);
    setError(null);
    try {
      const result = await applyGroup({
        organizationId,
        memberUserKey,
        templateGroupId: groupId,
        pipelineFileId,
        ...(actorUserKey ? { actorUserKey } : {}),
      });
      onApplied?.({ count: result.count, groupName: result.groupName });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply playbook");
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <ActionSuiteModal
      title="Apply task playbook"
      onClose={onClose}
      testId="task-template-apply-modal"
    >
      <p className="mb-3 text-sm text-muted-foreground">
        Choose a playbook group to bulk-create tasks on this file — including
        triage labels and template attachments.
      </p>

      {groups.length === 0 ? (
        <div className="rounded-dlc-sm border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
          <BookOpen className="mb-2 h-5 w-5 opacity-60" aria-hidden />
          <p>No playbooks yet. Admins can build groups under</p>
          <p className="font-medium text-foreground">
            Settings → Task library
          </p>
        </div>
      ) : (
        <ul className="max-h-[min(24rem,60dvh)] space-y-2 overflow-y-auto">
          {groups.map((group) => {
            const busy = applyingId === group._id;
            return (
              <li key={group._id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-start justify-between gap-3 rounded-dlc-md border border-border/60 bg-background px-3 py-3 text-left",
                    "transition-colors duration-dlc-standard ease-dlc-standard hover:border-primary/40 hover:bg-muted/20",
                    busy && "pointer-events-none opacity-70",
                  )}
                  disabled={busy || applyingId != null}
                  onClick={() => void handleApply(group._id)}
                  data-testid={`apply-template-group-${group._id}`}
                >
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {group.name}
                    </span>
                    {group.description ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {group.description}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {group.templateCount} task
                      {group.templateCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  {busy ? (
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin text-primary"
                      aria-hidden
                    />
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-primary">
                      Apply
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </ActionSuiteModal>
  );
}
