"use client";

import { useMemo } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  graphLinksForRow,
  HUB_PROJECTION_MODE_LABELS,
  isHubProjectionMode,
  type HubProjectionMode,
} from "@/lib/pipeline/graphProjection";
import {
  hubRowClientKey,
  hubRowProjectKey,
} from "@/lib/pipeline/hubHierarchyTree";
import { isSyntheticHubProjectKey } from "@/lib/pipeline/hubHierarchyKeys";
import { loadHubProjectionMode } from "@/lib/pipeline/pipelineHubPersistence";
import {
  contactHubBackLabel,
  contactHubHrefForClient,
} from "@/lib/pipeline/hubBreadcrumbRoutes";
import {
  PIPELINE_HUB_ENTITY_QUERY,
  PIPELINE_HUB_PROJECTION_QUERY,
  pipelineClientWorkspaceHref,
  pipelineHubClientHref,
  pipelineHubHref,
  pipelineHubProjectHref,
  pipelineHubProjectionHref,
} from "@/lib/pipeline/routes";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";

export type WorkspaceHierarchyCrumb = {
  label: string;
  href?: string;
};

export type WorkspaceHierarchyNav = {
  crumbs: WorkspaceHierarchyCrumb[];
  hubBackHref: string;
  hubBackLabel: string;
  clientHubHref: string;
  /** Canonical project workspace / hub href for the active file (empty when unassigned). */
  projectHref: string;
  projectLabel: string;
  hasProject: boolean;
};

export function useWorkspaceHierarchyCrumbs(args: {
  fileId?: Id<"pipeline">;
  row?: PipelineTablePreviewRow;
  searchParams: ReadonlyURLSearchParams;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  focusFileId?: string;
}): WorkspaceHierarchyNav {
  const { fileId, row, searchParams, organizationId, memberUserKey, focusFileId } =
    args;

  const clientHubDetail = useQuery(
    api.pipelineHierarchyQueries.getClientHubDetail,
    row?.clientId && organizationId && memberUserKey
      ? {
          organizationId,
          clientId: row.clientId,
          memberUserKey,
        }
      : "skip",
  );

  return useMemo(() => {
    const empty: WorkspaceHierarchyNav = {
      crumbs: [],
      hubBackHref: pipelineHubHref(focusFileId),
      hubBackLabel: "Pipeline hub",
      clientHubHref: pipelineHubHref(focusFileId),
      projectHref: "",
      projectLabel: "",
      hasProject: false,
    };
    if (!fileId || !row) return empty;

    const clientKey = row.clientId
      ? String(row.clientId)
      : hubRowClientKey(row);
    const projectKey = hubRowProjectKey(row);
    const rawMode = searchParams.get(PIPELINE_HUB_PROJECTION_QUERY);
    const hubEntity = searchParams.get(PIPELINE_HUB_ENTITY_QUERY);
    const mode: HubProjectionMode =
      rawMode && isHubProjectionMode(rawMode)
        ? rawMode
        : loadHubProjectionMode() ?? "client";
    const gl = graphLinksForRow(row);
    const fileCrumb: WorkspaceHierarchyCrumb = {
      label: row.fileName?.trim() || "Loan file",
    };

    const clientDisplayName = row.clientDisplayName?.trim() || "Client";
    const projectDisplayTitle = row.projectDisplayTitle?.trim() || "Project";

    const clientHubHref = row.clientId
      ? contactHubHrefForClient({
          clientId: row.clientId,
          primaryContactId: clientHubDetail?.client?.primaryContactId,
        })
      : pipelineHubClientHref(clientKey);

    const projectHref = (() => {
      const persistedProjectId = row.projectId
        ? String(row.projectId)
        : !isSyntheticHubProjectKey(projectKey)
          ? projectKey
          : "";
      if (row.clientId && persistedProjectId) {
        return pipelineClientWorkspaceHref(String(row.clientId), {
          projectId: persistedProjectId,
        });
      }
      return pipelineHubProjectHref(clientKey, projectKey);
    })();

    const hubFirstClientCrumbs: WorkspaceHierarchyCrumb[] = [
      // True relational hierarchy: Pipeline > Client > Project > File.
      { label: "Pipeline", href: pipelineHubHref(focusFileId) },
      { label: clientDisplayName, href: clientHubHref },
      { label: projectDisplayTitle, href: projectHref },
      fileCrumb,
    ];

    const entityCrumb = (label: string, entityId?: string | null) => ({
      label,
      href: pipelineHubProjectionHref(mode, entityId ?? undefined),
    });

    let crumbs: WorkspaceHierarchyCrumb[];
    if (mode === "client") {
      crumbs = hubFirstClientCrumbs;
    } else if (mode === "project") {
      crumbs = [
        {
          label: HUB_PROJECTION_MODE_LABELS.project,
          href: pipelineHubHref(undefined, { hubMode: "project" }),
        },
        {
          label: projectDisplayTitle,
          href: pipelineHubHref(undefined, {
            hubMode: "project",
            hubProject: projectKey,
          }),
        },
        fileCrumb,
      ];
    } else if (mode === "file") {
      crumbs = [
        {
          label: HUB_PROJECTION_MODE_LABELS.file,
          href: pipelineHubHref(undefined, { hubMode: "file" }),
        },
        fileCrumb,
      ];
    } else if (mode === "lender") {
      const lender =
        gl.lenders.find((l) => l.id === hubEntity) ?? gl.lenders[0];
      crumbs = [
        entityCrumb(HUB_PROJECTION_MODE_LABELS.lender),
        ...(lender ? [entityCrumb(lender.label, lender.id)] : []),
        fileCrumb,
      ];
    } else if (mode === "referral") {
      const ref =
        gl.referrals.find((r) => r.id === hubEntity) ?? gl.referrals[0];
      crumbs = [
        entityCrumb(HUB_PROJECTION_MODE_LABELS.referral),
        ...(ref ? [entityCrumb(ref.label, ref.id)] : []),
        fileCrumb,
      ];
    } else if (mode === "team") {
      const member = gl.team.find((t) => t.id === hubEntity) ?? gl.team[0];
      crumbs = [
        entityCrumb(HUB_PROJECTION_MODE_LABELS.team),
        ...(member ? [entityCrumb(member.label, member.id)] : []),
        fileCrumb,
      ];
    } else if (mode === "task") {
      const task = gl.tasks[0];
      crumbs = [
        entityCrumb(HUB_PROJECTION_MODE_LABELS.task),
        ...(task ? [entityCrumb(task.label, task.id)] : []),
        fileCrumb,
      ];
    } else {
      crumbs = hubFirstClientCrumbs;
    }

    const hasPersistedProject = Boolean(
      row.projectId ||
        (!isSyntheticHubProjectKey(projectKey) && projectKey.trim()),
    );

    return {
      crumbs,
      hubBackHref: mode === "client" ? clientHubHref : pipelineHubHref(focusFileId),
      hubBackLabel:
        mode === "client"
          ? contactHubBackLabel(clientDisplayName)
          : "Pipeline hub",
      clientHubHref,
      projectHref: hasPersistedProject ? projectHref : "",
      projectLabel: hasPersistedProject ? projectDisplayTitle : "",
      hasProject: hasPersistedProject,
    };
  }, [
    clientHubDetail?.client?.primaryContactId,
    fileId,
    focusFileId,
    row,
    searchParams,
  ]);
}
