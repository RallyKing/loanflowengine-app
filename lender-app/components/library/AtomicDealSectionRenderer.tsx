"use client";

import type { DealSectionProps } from "@/lib/file/dealSectionTypes";
import type { ShareSectionId } from "@/convex/shareSections";
import {
  AssetsSection,
  BorrowersSection,
  HouseholdSection,
  IncomeSection,
  LoansSection,
  NotesSection,
  OverviewSection,
  PropertySection,
  WorkflowSection,
} from "@/components/intake/IntakeEditor";
import {
  BusinessSection,
  CommercialSection,
  FeesSection,
  GuarantorsSection,
  HardMoneySection,
} from "@/components/intake/IntakeSectionsBiz";
import {
  ComparisonSection,
  CoverSection,
  DayCounterSection,
  DtiSection,
  PayoffSection,
  ReoSection,
  ScenarioSection,
  WeightedInterestSection,
} from "@/components/intake/IntakeSections2";

export type AtomicDealSectionRendererProps = DealSectionProps & {
  sectionId: ShareSectionId;
};

/** Renders a single deal intake section — shared by portal, execution, and builder preview. */
export function AtomicDealSectionRenderer({
  sectionId,
  draft,
  update,
}: AtomicDealSectionRendererProps) {
  const props: DealSectionProps = { draft, update };
  switch (sectionId) {
    case "cover":
      return <CoverSection {...props} />;
    case "scenario":
      return <ScenarioSection {...props} />;
    case "overview":
      return <OverviewSection {...props} />;
    case "borrowers":
      return <BorrowersSection {...props} />;
    case "guarantors":
      return <GuarantorsSection {...props} />;
    case "business":
      return <BusinessSection {...props} />;
    case "property":
      return <PropertySection {...props} />;
    case "commercial":
      return <CommercialSection {...props} />;
    case "hardmoney":
      return <HardMoneySection {...props} />;
    case "loans":
      return <LoansSection {...props} />;
    case "income":
      return <IncomeSection {...props} />;
    case "assets":
      return <AssetsSection {...props} />;
    case "household":
      return <HouseholdSection {...props} />;
    case "workflow":
      return <WorkflowSection {...props} />;
    case "notes":
      return <NotesSection {...props} />;
    case "dti":
      return <DtiSection {...props} />;
    case "reo":
      return <ReoSection {...props} />;
    case "comparison":
      return <ComparisonSection {...props} />;
    case "weighted":
      return <WeightedInterestSection {...props} />;
    case "payoff":
      return <PayoffSection {...props} />;
    case "daycounter":
      return <DayCounterSection {...props} />;
    case "fees":
      return <FeesSection {...props} />;
    default:
      return null;
  }
}
