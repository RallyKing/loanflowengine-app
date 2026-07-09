"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { ScenarioSection } from "@/components/intake/IntakeSections2";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { PipelineScenarioMatch } from "@/components/PipelineScenarioMatch";
import { cn } from "@/lib/cn";
import { DEAL_TAB_LABELS } from "@/lib/file/dealWorkspaceLayout";
import { useDealWorkspaceEditor } from "@/lib/file/useDealWorkspaceEditor";
import {
  DEAL_WORKSPACE_TAB3_SECTION_LABELS,
} from "@/lib/file/dealWorkspaceTab3Layout";
import { DEAL_WORKSPACE_WORKSPACE_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";
import { resolvePipelineTableFundingAmount } from "@/lib/pipeline/resolvePipelineTableFundingAmount";
import { premiumTabStackClass } from "@/lib/pipeline/premiumWorkspaceUi";

function ScenariosLenderMatchBody() {
  const { fileId, draft, update, dealBundle } = useDealWorkspaceEditor();
  const pipeline = dealBundle?.pipeline;

  const fundingAmount = useMemo(
    () =>
      draft && pipeline
        ? resolvePipelineTableFundingAmount(draft, pipeline)
        : 0,
    [draft, pipeline],
  );

  const attachedLenderIds = useMemo(
    () => new Set(pipeline?.lenders ?? []),
    [pipeline?.lenders],
  );

  if (!draft || !pipeline) {
    return (
      <div className="rounded-dlc-md border border-dashed border-border/70 bg-dlc-surface-high/40 px-4 py-6 text-center text-sm text-muted-foreground">
        Loading scenario workspace…
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col", premiumTabStackClass)}>
      <ScenarioSection draft={draft} update={update} />
      <PipelineScenarioMatch
        embedded
        fileId={fileId}
        fileUpdatedAt={pipeline.updatedAt}
        fundingAmount={fundingAmount}
        scenarioText={pipeline.scenario}
        criteria={pipeline.scenarioCriteria}
        attachedLenderIds={attachedLenderIds}
      />
    </div>
  );
}

/** Scenarios & Lender Match — deal structuring block for Portals tab. */
export function DealWorkspaceScenariosSection() {
  return (
    <div data-testid="pipeline-portals-scenarios-section">
      <CollapsibleBlock
        id={DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.scenariosLenderMatch}
        title={DEAL_WORKSPACE_TAB3_SECTION_LABELS.scenariomatch}
        status="Modeling"
        summary="Scenario criteria and lender attach tooling"
        icon={<Sparkles className="h-4 w-4" aria-hidden />}
        description="Scenario modeling, saved match criteria, and lender attach tooling."
        lazyMount
        animated
        contentClassName="space-y-4"
      >
        <ScenariosLenderMatchBody />
      </CollapsibleBlock>
    </div>
  );
}

/** @deprecated Internal alias — fees closing section title source. */
export const FEES_CLOSING_SECTION_TITLE = DEAL_TAB_LABELS.fees;
