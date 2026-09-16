"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { pipelineClientWorkspaceHref } from "@/lib/pipeline/routes";
import { isLikelyConvexTableId } from "@/lib/pipeline/hubHierarchyKeys";

const PipelineFileWorkspace = dynamic(
  () =>
    import("@/components/PipelineFileWorkspace").then((m) => ({
      default: m.PipelineFileWorkspace,
    })),
  { ssr: false, loading: () => null },
);

/**
 * Hotfix: path ids that are contacts/clients (not pipeline) used to crash
 * `pipeline:getDetail` with ArgumentValidationError → Convex "Server Error".
 * Resolve first, redirect, and only mount the file workspace for real files.
 */
export function PipelineFilePageClient({ fileId }: { fileId: string }) {
  const router = useRouter();
  const { activeOrganizationId } = useOrgPermissions();
  const memberUserKey = useActorUserKey().trim() || undefined;
  const rawId = fileId.trim();
  const canResolve =
    isLikelyConvexTableId(rawId) && Boolean(memberUserKey);

  const target = useQuery(
    api.pipelineFileRouteResolve.resolveFileRouteTarget,
    canResolve
      ? {
          rawId,
          organizationId: activeOrganizationId ?? undefined,
          memberUserKey,
        }
      : "skip",
  );

  useEffect(() => {
    if (!canResolve || target === undefined) return;
    if (target.kind === "client") {
      router.replace(pipelineClientWorkspaceHref(String(target.clientId)));
      return;
    }
    if (target.kind === "contact") {
      router.replace(`/contacts/${encodeURIComponent(String(target.contactId))}`);
    }
  }, [canResolve, target, router]);

  if (!canResolve) {
    return (
      <div className="p-6 text-sm text-muted-foreground" role="alert">
        Invalid pipeline file link.
      </div>
    );
  }

  if (target === undefined) {
    return (
      <div
        className="p-6 text-sm text-muted-foreground"
        data-testid="pipeline-file-route-resolving"
      >
        Opening file…
      </div>
    );
  }

  if (target.kind === "client" || target.kind === "contact") {
    return (
      <div
        className="p-6 text-sm text-muted-foreground"
        data-testid="pipeline-file-route-redirecting"
      >
        Redirecting…
      </div>
    );
  }

  if (target.kind === "missing" || target.kind === "invalid") {
    return (
      <div className="p-6 text-sm text-muted-foreground" role="alert">
        Pipeline file not found.
      </div>
    );
  }

  return (
    <PipelineFileWorkspace
      key={target.fileId}
      fileId={target.fileId as Id<"pipeline">}
    />
  );
}
