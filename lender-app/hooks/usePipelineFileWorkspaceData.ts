"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildPipelineSwitcherRows } from "@/lib/pipeline/workspaceDataDerivations";
import { isPipelineFileQueryId } from "@/lib/pipeline/workspaceFileQuery";
import {
  useConvexSubMountTrace,
  useConvexSubQueryArgsTrace,
} from "@/lib/convexSubDiagnosticsHooks";

/**
 * Single-flight Convex subscription surface for `PipelineFileWorkspace`.
 * Keeps all file-scoped `useQuery` calls in one module so the orchestrator
 * does not sprawl and duplicate subscription wiring.
 */
export function usePipelineFileWorkspaceData(args: {
  fileId: Id<"pipeline"> | undefined;
  convexMemberKey: string | undefined;
  preferencesAccountId: string | undefined;
  activeOrganizationId: Id<"organizations"> | null | undefined;
  accountId: string;
  /** Nested fractal file card — skip hub switcher subscriptions. */
  embedded?: boolean;
}) {
  const {
    fileId,
    convexMemberKey,
    preferencesAccountId,
    activeOrganizationId,
    accountId,
    embedded = false,
  } = args;

  const fileQueryEnabled = isPipelineFileQueryId(fileId);

  useConvexSubMountTrace("usePipelineFileWorkspaceData");

  const orgConvexArgs = useMemo(() => {
    if (!activeOrganizationId || !convexMemberKey) return null;
    return {
      organizationId: activeOrganizationId,
      memberUserKey: convexMemberKey,
    };
  }, [activeOrganizationId, convexMemberKey]);

  const pipelineSwitcherListArgs = useMemo(():
    | {
        organizationId: Id<"organizations">;
        memberUserKey: string;
        includeArchived: boolean;
        includeSnoozed: boolean;
      }
    | "skip" => {
    if (embedded || !fileQueryEnabled) return "skip";
    if (!activeOrganizationId || !preferencesAccountId) return "skip";
    return {
      organizationId: activeOrganizationId,
      memberUserKey: preferencesAccountId,
      includeArchived: true,
      includeSnoozed: true,
    };
  }, [embedded, fileQueryEnabled, activeOrganizationId, preferencesAccountId]);

  const pipelineSwitcherPreview = useQuery(
    api.pipeline.listTablePreview,
    pipelineSwitcherListArgs,
  );

  const pipelineSwitcherRows = useMemo(
    () => buildPipelineSwitcherRows(pipelineSwitcherPreview),
    [pipelineSwitcherPreview],
  );

  const qArgs = useMemo(():
    | { id: Id<"pipeline">; memberUserKey?: string }
    | "skip" => {
    if (!fileQueryEnabled || !fileId) return "skip";
    if (convexMemberKey) {
      return { id: fileId, memberUserKey: convexMemberKey };
    }
    return { id: fileId };
  }, [fileId, fileQueryEnabled, convexMemberKey]);

  useConvexSubQueryArgsTrace("usePipelineFileWorkspaceData:getDetail", qArgs, {
    queryKey: "pipeline.getDetail",
    route: "file",
  });
  const detail = useQuery(api.pipeline.getDetail, qArgs);

  const pipelineOrgId = detail?.pipeline?.organizationId ?? undefined;

  /** Lender search org scope — query runs inside `LenderSearchPanel`. */
  const lenderOrgArgs = useMemo(() => {
    const organizationId = pipelineOrgId ?? activeOrganizationId;
    const memberUserKey = (convexMemberKey ?? preferencesAccountId)?.trim();
    if (!organizationId || !memberUserKey) return null;
    return { organizationId, memberUserKey };
  }, [
    activeOrganizationId,
    convexMemberKey,
    pipelineOrgId,
    preferencesAccountId,
  ]);

  const orgPlanEntitlementsArgs = useMemo(():
    | { organizationId: Id<"organizations">; memberUserKey: string }
    | "skip" => {
    if (!pipelineOrgId || !convexMemberKey) return "skip";
    return { organizationId: pipelineOrgId, memberUserKey: convexMemberKey };
  }, [pipelineOrgId, convexMemberKey]);

  const orgPlanEntitlements = useQuery(
    api.organizationPlan.featureEntitlements,
    orgPlanEntitlementsArgs,
  );

  const intakeSheetIdForLicense = detail?.pipeline?.intakeSheetId;
  const intakeForLicenseArgs = useMemo(():
    | { id: Id<"intakeSheets"> }
    | "skip" => {
    if (!intakeSheetIdForLicense) return "skip";
    return { id: intakeSheetIdForLicense };
  }, [intakeSheetIdForLicense]);

  const intakeForLicense = useQuery(api.intakeSheets.get, intakeForLicenseArgs);

  const simpleWorkflowsArgs = useMemo(():
    | { accountId: string }
    | "skip" => {
    const a = accountId.trim();
    return a ? { accountId: a } : "skip";
  }, [accountId]);

  const simpleWorkflowsDoc = useQuery(
    api.userSimpleWorkflows.getByAccountId,
    simpleWorkflowsArgs,
  );

  const linkedTasksArgs = useMemo(():
    | {
        fileId: Id<"pipeline">;
        organizationId: Id<"organizations">;
        memberUserKey: string;
      }
    | "skip" => {
    if (!fileQueryEnabled || !fileId || !orgConvexArgs) return "skip";
    return {
      fileId,
      organizationId: orgConvexArgs.organizationId,
      memberUserKey: orgConvexArgs.memberUserKey,
    };
  }, [fileId, fileQueryEnabled, orgConvexArgs]);

  const linkedTasks = useQuery(api.tasks.byRelatedFile, linkedTasksArgs);

  const standaloneContacts = useQuery(
    api.contacts.list,
    orgConvexArgs ?? "skip",
  );

  const listByFileArgs = useMemo(():
    | { fileId: Id<"pipeline">; memberUserKey?: string }
    | "skip" => {
    if (!fileQueryEnabled || !fileId) return "skip";
    return convexMemberKey
      ? { fileId, memberUserKey: convexMemberKey }
      : { fileId };
  }, [fileId, fileQueryEnabled, convexMemberKey]);

  const listByFileRaw = useQuery(
    api.contactFileLinks.listByFile,
    listByFileArgs === "skip" ? "skip" : listByFileArgs,
  );

  const associatedContactLinks = useMemo(() => {
    if (listByFileRaw === undefined) return undefined;
    if (!listByFileRaw.ok) {
      console.warn("[contactFileLinks.listByFile]", listByFileRaw);
      return [];
    }
    if (listByFileRaw.warnings?.length) {
      console.warn(
        "[contactFileLinks.listByFile] integrity warnings",
        listByFileRaw.warnings,
        listByFileRaw.meta,
      );
    }
    return listByFileRaw.links;
  }, [listByFileRaw]);

  const linkedTaskIdsForAttachmentCounts = useMemo(() => {
    const list = linkedTasks ?? [];
    return list.map((t) => t._id);
  }, [linkedTasks]);

  const fileTaskAttachmentCountsRaw = useQuery(
    api.tasks.countTaskFilesForTasks,
    linkedTaskIdsForAttachmentCounts.length > 0 && orgConvexArgs
      ? { taskIds: linkedTaskIdsForAttachmentCounts, ...orgConvexArgs }
      : "skip",
  );

  const fileTaskAttachmentCounts =
    linkedTaskIdsForAttachmentCounts.length === 0
      ? undefined
      : fileTaskAttachmentCountsRaw;

  const revenueOrgArgs = useMemo(():
    | {
        organizationId: Id<"organizations">;
        memberUserKey: string;
      }
    | "skip" => {
    const oid = detail?.pipeline?.organizationId;
    const pk = preferencesAccountId?.trim();
    if (!oid || !pk) return "skip";
    return { organizationId: oid, memberUserKey: pk };
  }, [detail?.pipeline?.organizationId, preferencesAccountId]);

  const revenueOrgAgg = useQuery(
    api.revenue.aggregateForOrganization,
    revenueOrgArgs,
  );

  const revenueUserArgs = useMemo(():
    | {
        organizationId: Id<"organizations">;
        memberUserKey: string;
        attributionUserKey: string;
      }
    | "skip" => {
    const oid = detail?.pipeline?.organizationId;
    const pk = preferencesAccountId?.trim();
    if (!oid || !pk) return "skip";
    return {
      organizationId: oid,
      memberUserKey: pk,
      attributionUserKey: pk,
    };
  }, [detail?.pipeline?.organizationId, preferencesAccountId]);

  const revenueUserAgg = useQuery(
    api.revenue.aggregateAttributedToUser,
    revenueUserArgs,
  );

  return {
    fileQueryEnabled,
    orgConvexArgs,
    qArgs,
    detail: fileQueryEnabled ? detail : null,
    pipelineSwitcherPreview,
    pipelineSwitcherRows,
    orgPlanEntitlements,
    intakeForLicense,
    simpleWorkflowsDoc,
    linkedTasks,
    standaloneContacts,
    associatedContactLinks,
    fileTaskAttachmentCounts,
    lenderOrgArgs,
    revenueOrgAgg,
    revenueUserAgg,
    pipelineOrgId,
  };
}
