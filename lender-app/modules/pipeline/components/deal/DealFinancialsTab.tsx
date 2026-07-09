"use client";

import type { ComponentProps, ReactNode } from "react";
import { DealInfoTab, type DealInfoTabProps } from "@/components/pipeline/tabs/DealInfoTab";
import { DealWorkspaceTab } from "@/components/pipeline/tabs/DealWorkspaceTab";
import { cn } from "@/lib/cn";
import { premiumTabStackClass } from "@/lib/pipeline/premiumWorkspaceUi";

export type DealFinancialsTabProps = {
  className?: string;
  dealInfo: DealInfoTabProps;
  dealWorkspace: ComponentProps<typeof DealWorkspaceTab>;
  /** Phase Modular-C — opt-in blocks (construction budget, PFS) when active. */
  modularBlocks?: ReactNode;
};

/** Financials tab — underwriting schedules, LTV/DSCR workspace, calculators. */
export function DealFinancialsTab({
  className,
  dealInfo,
  dealWorkspace,
  modularBlocks,
}: DealFinancialsTabProps) {
  return (
    <div
      className={cn("flex min-w-0 flex-col", premiumTabStackClass, className)}
      data-testid="pipeline-deal-financials-tab"
    >
      <DealInfoTab {...dealInfo} sectionGroup="financials" />
      {modularBlocks}
      <DealWorkspaceTab {...dealWorkspace} />
    </div>
  );
}
