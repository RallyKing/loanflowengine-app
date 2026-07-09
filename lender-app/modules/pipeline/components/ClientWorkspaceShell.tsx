"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { pipelineHubHref } from "@/lib/pipeline/routes";
import { WorkspaceContentContainer } from "@/components/WorkspaceContentContainer";
import { ClientWorkspaceHeader } from "@/components/pipeline/ClientWorkspaceHeader";
import { ProjectWorkspaceContainer } from "@/components/pipeline/ProjectWorkspaceContainer";
import {
  SortableSectionItem,
  SortableSectionList,
} from "@/components/pipeline/workspace/SortableSectionList";
import {
  projectWorkspaceBadgeVariant,
  projectWorkspaceFundingSummary,
  projectWorkspaceStatusLabel,
} from "@/lib/pipeline/clientWorkspaceTree";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

const DEFAULT_FILE_STATUS = "confirm_interest";

export type ClientWorkspaceShellProps = {
  clientId: Id<"clients">;
  /** Deep-link: expand this project block on load (`?project=`). */
  initialProjectId?: string;
};

/**
 * Phase 55.1 — Client-tier workspace shell (header + canvas for project/file blocks).
 */
export function ClientWorkspaceShell({
  clientId,
  initialProjectId,
}: ClientWorkspaceShellProps) {
  const { activeOrganizationId } = useOrgPermissions();
  const actorKeyRaw = useActorUserKey();
  const convexMemberKey = actorKeyRaw.trim() || undefined;

  const treeArgs = useMemo(():
    | {
        organizationId: Id<"organizations">;
        clientId: Id<"clients">;
        memberUserKey: string;
      }
    | "skip" => {
    if (!activeOrganizationId || !convexMemberKey) return "skip";
    return {
      organizationId: activeOrganizationId,
      clientId,
      memberUserKey: convexMemberKey,
    };
  }, [activeOrganizationId, clientId, convexMemberKey]);

  const tree = useQuery(api.pipelineClientWorkspace.getClientWorkspaceTree, treeArgs);
  const createProject = useMutation(
    api.pipelineHierarchyMutations.createProjectUnderClient,
  );
  const reorderClientProjects = useMutation(
    api.pipelineClientWorkspaceMutations.reorderClientProjects,
  );
  const [creatingProject, setCreatingProject] = useState(false);
  const [localProjectIds, setLocalProjectIds] = useState<string[]>([]);

  const serverProjectIds = useMemo(
    () => (tree && tree !== null ? tree.projects.map((p) => String(p._id)) : []),
    [tree],
  );

  useEffect(() => {
    setLocalProjectIds(serverProjectIds);
  }, [serverProjectIds.join("|")]);

  const projectsById = useMemo(() => {
    if (!tree || tree === null) return new Map();
    return new Map(tree.projects.map((project) => [String(project._id), project] as const));
  }, [tree]);

  const orderedProjects = useMemo(() => {
    if (!tree || tree === null) return [];
    if (localProjectIds.length === 0) return tree.projects;
    const ordered = localProjectIds
      .map((id) => projectsById.get(id))
      .filter((project): project is NonNullable<typeof project> => project != null);
    // Server rows not yet mirrored into local order (e.g. a project created a
    // moment ago) render immediately — appended until the sync effect runs.
    const seen = new Set(localProjectIds);
    for (const project of tree.projects) {
      if (!seen.has(String(project._id))) ordered.push(project);
    }
    return ordered;
  }, [localProjectIds, projectsById, tree]);

  const onProjectDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (
        treeArgs === "skip" ||
        !activeOrganizationId ||
        !convexMemberKey?.trim()
      ) {
        return;
      }
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = localProjectIds.indexOf(String(active.id));
      const newIndex = localProjectIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const next = arrayMove(localProjectIds, oldIndex, newIndex);
      setLocalProjectIds(next);
      try {
        await reorderClientProjects({
          organizationId: activeOrganizationId,
          clientId,
          memberUserKey: convexMemberKey,
          orderedProjectIds: next as Id<"projects">[],
        });
      } catch {
        setLocalProjectIds(serverProjectIds);
      }
    },
    [
      activeOrganizationId,
      clientId,
      convexMemberKey,
      localProjectIds,
      reorderClientProjects,
      serverProjectIds,
      treeArgs,
    ],
  );

  const onAddProject = useCallback(async () => {
    if (
      treeArgs === "skip" ||
      !activeOrganizationId ||
      !convexMemberKey?.trim()
    ) {
      return;
    }
    const projectTitle = window.prompt("New project name");
    const trimmedTitle = projectTitle?.trim();
    if (!trimmedTitle) return;
    const filePrompt = window.prompt(
      "Initial loan file name (optional)",
      `${trimmedTitle} — New file`,
    );
    const fileName = filePrompt?.trim() || `${trimmedTitle} — New file`;
    setCreatingProject(true);
    try {
      await createProject({
        organizationId: activeOrganizationId,
        memberUserKey: convexMemberKey,
        clientId,
        projectTitle: trimmedTitle,
        fileName,
        status: DEFAULT_FILE_STATUS,
        fundingAmount: 0,
        rate: 0,
        term: "",
        lenders: [],
        contacts: [],
      });
    } finally {
      setCreatingProject(false);
    }
  }, [
    activeOrganizationId,
    clientId,
    convexMemberKey,
    createProject,
    treeArgs,
  ]);

  if (treeArgs === "skip" || tree === undefined) {
    return (
      <div
        className="flex min-h-[40vh] flex-col"
        data-testid="pipeline-client-workspace-loading"
      >
        <div className="h-14 shrink-0 animate-pulse border-b border-border/50 bg-muted/20" />
        <WorkspaceContentContainer width="fullBleed" className="px-2 py-2 sm:px-3 sm:py-3">
          <OperationalSkeletonList rows={4} />
        </WorkspaceContentContainer>
      </div>
    );
  }

  if (tree === null) {
    return (
      <div
        className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center"
        data-testid="pipeline-client-workspace-not-found"
      >
        <p className="text-sm text-muted-foreground">
          This client is missing or you do not have access.
        </p>
        <Link
          href={pipelineHubHref()}
          className="inline-flex h-9 items-center justify-center rounded-dlc-sm border border-border px-3 text-sm font-medium hover:bg-muted/60"
        >
          Back to Pipeline Hub
        </Link>
      </div>
    );
  }

  const hubBackHref = pipelineHubHref();

  return (
    <div
      className="flex w-full min-w-0 flex-col"
      data-testid="pipeline-client-workspace-shell"
    >
      <ClientWorkspaceHeader
        hubBackHref={hubBackHref}
        clientId={clientId}
        primaryContactId={tree.client.primaryContactId}
        primaryContactName={tree.client.primaryContactName}
        additionalContacts={tree.additionalContacts}
        linkedEntities={tree.linkedEntities}
        organizationId={activeOrganizationId ?? undefined}
        memberUserKey={convexMemberKey}
        canEdit={tree.client.accessLevel === "edit"}
      />
      <main
        className="w-full min-w-0"
        data-testid="pipeline-client-workspace-main"
      >
        <WorkspaceContentContainer width="fullBleed" className="px-2 py-2 sm:px-3 sm:py-3">
          <div
            className="flex flex-col gap-2"
            data-testid="pipeline-client-workspace-canvas"
          >
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={
                  creatingProject ||
                  !activeOrganizationId ||
                  !convexMemberKey?.trim()
                }
                data-testid="pipeline-client-workspace-add-project"
                onClick={() => void onAddProject()}
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                Add Project
              </Button>
            </div>
            {tree.projects.length === 0 && tree.unscopedFiles.length === 0 ? (
              <p
                className="rounded-dlc-md border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground"
                data-testid="pipeline-client-workspace-empty"
              >
                No projects or loan files are linked to this client yet.
              </p>
            ) : null}
            {orderedProjects.length > 0 ? (
              <SortableSectionList
                itemIds={localProjectIds}
                onDragEnd={onProjectDragEnd}
                disabled={
                  !activeOrganizationId ||
                  !convexMemberKey?.trim() ||
                  orderedProjects.length < 2
                }
              >
                <div className="flex flex-col gap-2">
                  {orderedProjects.map((project) => (
                    <SortableSectionItem
                      key={String(project._id)}
                      id={String(project._id)}
                      disabled={!activeOrganizationId || !convexMemberKey?.trim()}
                    >
                      {(dragHandle) => (
                        <ProjectWorkspaceContainer
                          containerId={String(project._id)}
                          projectId={project._id}
                          title={project.title}
                          status={projectWorkspaceStatusLabel(project.status)}
                          summary={projectWorkspaceFundingSummary(
                            project.targetFunding,
                            project.files.length,
                          )}
                          files={project.files}
                          badgeVariant={projectWorkspaceBadgeVariant(project.status)}
                          defaultOpen={
                            initialProjectId
                              ? String(project._id) === initialProjectId
                              : false
                          }
                          clientId={clientId}
                          organizationId={activeOrganizationId ?? undefined}
                          memberUserKey={convexMemberKey}
                          sortDragHandle={dragHandle}
                        />
                      )}
                    </SortableSectionItem>
                  ))}
                </div>
              </SortableSectionList>
            ) : null}
            {tree.unscopedFiles.length > 0 ? (
              <ProjectWorkspaceContainer
                containerId="unassigned"
                isUnassigned
                title="Unassigned Files"
                status={projectWorkspaceStatusLabel("unassigned")}
                summary={projectWorkspaceFundingSummary(
                  null,
                  tree.unscopedFiles.length,
                )}
                files={tree.unscopedFiles}
                badgeVariant={projectWorkspaceBadgeVariant("unassigned")}
                defaultOpen={false}
                clientId={clientId}
                organizationId={activeOrganizationId ?? undefined}
                memberUserKey={convexMemberKey}
              />
            ) : null}
          </div>
        </WorkspaceContentContainer>
      </main>
    </div>
  );
}
