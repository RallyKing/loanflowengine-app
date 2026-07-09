"use client";

import { UnderwritingLedgerTab } from "@/components/pipeline/tabs/UnderwritingLedgerTab";
import { ClientPortalTab } from "@/components/pipeline/tabs/ClientPortalTab";
import { DealWorkspaceScenariosSection } from "@/components/pipeline/deal/DealWorkspaceScenariosSection";
import { cn } from "@/lib/cn";
import {
  premiumSectionStackClass,
  premiumWorkspaceCanvasClass,
} from "@/lib/pipeline/premiumWorkspaceUi";
import type { Id } from "@/convex/_generated/dataModel";

export type PortalsAndProgressTabProps = {
  className?: string;
  underwriting: {
    fileId: Id<"pipeline">;
    memberUserKey?: string;
  };
  clientPortal?: React.ComponentProps<typeof ClientPortalTab>;
};

/** Portals & Progress — scenarios, underwriting ledger, client portal (single column). */
export function PortalsAndProgressTab({
  className,
  underwriting,
  clientPortal,
}: PortalsAndProgressTabProps) {
  return (
    <div
      className={cn(
        premiumWorkspaceCanvasClass,
        "flex min-w-0 flex-col",
        premiumSectionStackClass,
        className,
      )}
      data-testid="pipeline-portals-progress-tab"
    >
      <div
        className={premiumSectionStackClass}
        data-testid="pipeline-portals-unified-sections"
      >
        <DealWorkspaceScenariosSection />
        <UnderwritingLedgerTab
          fileId={underwriting.fileId}
          memberUserKey={underwriting.memberUserKey}
        />
        {clientPortal ? (
          <ClientPortalTab {...clientPortal} embedded />
        ) : null}
      </div>
    </div>
  );
}
