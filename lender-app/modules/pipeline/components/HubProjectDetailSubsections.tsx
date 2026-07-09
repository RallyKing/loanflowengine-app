"use client";

import { Landmark, Users } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { HubCollapsibleSubsection } from "@/components/pipeline/HubCollapsibleSubsection";
import { LinkedClientsEditor } from "@/components/pipeline/LinkedClientsEditor";
import { ProjectCapitalStackEditor } from "@/components/pipeline/ProjectCapitalStackEditor";

export type HubProjectDetailSubsectionsProps = {
  projectId: string;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  projectLoans: ReadonlyArray<{ id: string; fileName: string }>;
};

/** Project clients + capital stack blocks (collapsed by default). */
export function HubProjectDetailSubsections({
  projectId,
  organizationId,
  memberUserKey,
  projectLoans,
}: HubProjectDetailSubsectionsProps) {
  if (!organizationId || !memberUserKey?.trim()) return null;
  if (projectId.startsWith("legacy")) return null;

  const projectConvexId = projectId as Id<"projects">;

  return (
    <div
      className="space-y-2"
      data-testid="pipeline-hub-project-detail-subsections"
    >
      <HubCollapsibleSubsection
        title="Project clients"
        icon={Users}
        projectId={projectId}
        sectionId="clients"
        data-testid="pipeline-hub-subsection-project-clients"
      >
        <LinkedClientsEditor
          suppressTitle
          scope="project"
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          projectId={projectConvexId}
          compact
        />
      </HubCollapsibleSubsection>
      <HubCollapsibleSubsection
        title="Capital stack"
        icon={Landmark}
        projectId={projectId}
        sectionId="capitalStack"
        data-testid="pipeline-hub-subsection-capital-stack"
      >
        <ProjectCapitalStackEditor
          suppressTitle
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          projectId={projectConvexId}
          projectLoans={[...projectLoans]}
          compact
        />
      </HubCollapsibleSubsection>
    </div>
  );
}
