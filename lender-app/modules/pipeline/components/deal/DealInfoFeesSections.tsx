"use client";

import { useLayoutEffect, useMemo } from "react";
import { DollarSign, Scale } from "lucide-react";
import { FeesSection as IntakeFeesClosingSection } from "@/components/intake/IntakeSectionsBiz";
import {
  FeesSplitsBlock,
  type FeesSplitsBlockProps,
} from "@/components/pipeline/blocks/FeesSplitsBlock";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { cn } from "@/lib/cn";
import { DEAL_TAB_LABELS } from "@/lib/file/dealWorkspaceLayout";
import {
  DEAL_WORKSPACE_TAB3_SECTION_LABELS,
} from "@/lib/file/dealWorkspaceTab3Layout";
import type { RegisterCommandCenterSections } from "@/lib/file/commandCenterSectionRegistry";
import type {
  CommandCenterSectionRenderer,
  DealInfoCommandCenterSectionId,
} from "@/lib/file/dealInfoCommandCenterLayout";
import { useDealWorkspaceEditor } from "@/lib/file/useDealWorkspaceEditor";
import { DEAL_WORKSPACE_WORKSPACE_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";
import { premiumSectionStackClass } from "@/lib/pipeline/premiumWorkspaceUi";

export type DealInfoFeesSectionsProps = {
  className?: string;
  feesSplits?: FeesSplitsBlockProps;
  /** Parent owns DnD — register section renderers instead of rendering inline. */
  suppressInternalDnd?: boolean;
  onRegisterSections?: RegisterCommandCenterSections;
};

/** Fees & splits and Fees & closing — bottom of Deal Info command center. */
export function DealInfoFeesSections({
  className,
  feesSplits,
  suppressInternalDnd = false,
  onRegisterSections,
}: DealInfoFeesSectionsProps) {
  const { draft, update } = useDealWorkspaceEditor();

  const feesRegisterSig = useMemo(
    () =>
      [
        feesSplits ? "splits" : "no-splits",
        draft?.updatedAt ?? 0,
      ].join("|"),
    [draft?.updatedAt, feesSplits],
  );

  useLayoutEffect(() => {
    if (!suppressInternalDnd || !onRegisterSections || !draft) return;

    const sections: Partial<
      Record<DealInfoCommandCenterSectionId, CommandCenterSectionRenderer>
    > = {};

    if (feesSplits) {
      sections.feesSplits = (dragHandle) => (
        <CollapsibleBlock
          id={DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.feesSplits}
          title={DEAL_WORKSPACE_TAB3_SECTION_LABELS.feesSplits}
          status="Splits"
          summary="Percent of loan plus optional outside fee"
          icon={<DollarSign className="h-4 w-4" aria-hidden />}
          description="Percent of loan plus optional outside fee. Totals update when the loan or inputs change."
          headerRight={dragHandle}
          lazyMount
          animated
          contentClassName="space-y-4"
        >
          <FeesSplitsBlock {...feesSplits} />
        </CollapsibleBlock>
      );
    }

    sections.fees = (dragHandle) => (
      <CollapsibleBlock
        id={DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.feesClosing}
        title={DEAL_TAB_LABELS.fees}
        status="Closing"
        summary="Broker, lender, third-party, prepaids, and totals"
        icon={<Scale className="h-4 w-4" aria-hidden />}
        description="Broker, lender, third-party, prepaids, and total estimated closing fees."
        headerRight={dragHandle}
        lazyMount
        animated
        contentClassName="space-y-4"
      >
        <IntakeFeesClosingSection draft={draft} update={update} />
      </CollapsibleBlock>
    );

    onRegisterSections(sections, feesRegisterSig);
  }, [
    draft,
    feesRegisterSig,
    feesSplits,
    onRegisterSections,
    suppressInternalDnd,
    update,
  ]);

  if (!draft) {
    if (suppressInternalDnd) return null;
    return (
      <div
        className="rounded-dlc-md border border-dashed border-border/70 bg-dlc-surface-high/40 px-4 py-6 text-center text-sm text-muted-foreground"
        role="status"
        data-testid="pipeline-deal-info-fees-loading"
      >
        Loading fees sections…
      </div>
    );
  }

  if (suppressInternalDnd) {
    return null;
  }

  return (
    <div
      className={cn(premiumSectionStackClass, className)}
      data-testid="pipeline-deal-info-fees-sections"
    >
      {feesSplits ? (
        <CollapsibleBlock
          id={DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.feesSplits}
          title={DEAL_WORKSPACE_TAB3_SECTION_LABELS.feesSplits}
          status="Splits"
          summary="Percent of loan plus optional outside fee"
          icon={<DollarSign className="h-4 w-4" aria-hidden />}
          description="Percent of loan plus optional outside fee. Totals update when the loan or inputs change."
          lazyMount
          animated
          contentClassName="space-y-4"
        >
          <FeesSplitsBlock {...feesSplits} />
        </CollapsibleBlock>
      ) : null}
      <CollapsibleBlock
        id={DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.feesClosing}
        title={DEAL_TAB_LABELS.fees}
        status="Closing"
        summary="Broker, lender, third-party, prepaids, and totals"
        icon={<Scale className="h-4 w-4" aria-hidden />}
        description="Broker, lender, third-party, prepaids, and total estimated closing fees."
        lazyMount
        animated
        contentClassName="space-y-4"
      >
        <IntakeFeesClosingSection draft={draft} update={update} />
      </CollapsibleBlock>
    </div>
  );
}
