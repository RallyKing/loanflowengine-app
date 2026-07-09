"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { Button } from "@/components/ui/Button";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { OperationalEmptyState } from "@/components/ui/OperationalEmptyState";
import { EntityHubDetailPanel } from "@/components/contacts/EntityHubDetailPanel";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useLiveConnection } from "@/lib/useLiveConnection";

type EntityHubPageProps = {
  entityId: Id<"clients">;
};

function EntityHubPageInner({ entityId }: EntityHubPageProps) {
  const { accountId } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const { canUseHub } = useLiveConnection();
  const memberKey = accountId.trim();

  const entityHubDetail = useQuery(
    api.pipelineHierarchyQueries.getClientHubDetail,
    activeOrganizationId && memberKey
      ? {
          organizationId: activeOrganizationId,
          clientId: entityId,
          memberUserKey: memberKey,
        }
      : "skip",
  );

  if (!activeOrganizationId || !memberKey) {
    return (
      <OperationalEmptyState
        className="m-8"
        title="Organization required"
        description="Select an organization to view this entity."
      />
    );
  }

  if (entityHubDetail === undefined) {
    return (
      <div className="p-8">
        <OperationalSkeletonList rows={6} />
      </div>
    );
  }

  if (entityHubDetail === null || !entityHubDetail.client) {
    return (
      <OperationalEmptyState
        className="m-8"
        title="Entity not found"
        description="This business entity may have been removed or you may not have access."
      />
    );
  }

  return (
    <EntityHubDetailPanel
      organizationId={activeOrganizationId}
      memberUserKey={memberKey}
      entityId={entityId}
      client={entityHubDetail.client}
      canEdit={entityHubDetail.canEdit}
      canUseHub={canUseHub}
      layoutMode="commandCenter"
    />
  );
}

export default function EntityHubPage({
  params,
}: {
  params: Promise<{ entityId: string }>;
}) {
  const [entityId, setEntityId] = useState<Id<"clients"> | null>(null);
  const [queryRecover, setQueryRecover] = useState(0);

  useEffect(() => {
    void params.then((p) => {
      setEntityId(p.entityId as Id<"clients">);
    });
  }, [params]);

  if (!entityId) {
    return (
      <div className="p-8">
        <OperationalSkeletonList rows={4} />
      </div>
    );
  }

  return (
    <ConvexQueryBoundary
      recoverOnKeys={[queryRecover, entityId]}
      fallback={
        <div className="space-y-4 p-8">
          <p className="font-medium text-destructive">Could not load entity hub</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setQueryRecover((n) => n + 1)}
          >
            Retry
          </Button>
        </div>
      }
    >
      <EntityHubPageInner entityId={entityId} />
    </ConvexQueryBoundary>
  );
}
