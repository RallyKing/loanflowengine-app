/**
 * Tab metadata for the full deal / application workspace used on pipeline files
 * (`pipeline.dealData`) and legacy `intakeSheets` rows. Sections render shared
 * components from `components/intake/IntakeEditor.tsx` (collapsible stack in
 * the pipeline file drawer) and related modules.
 */
export const DEAL_TAB_GROUPS = [
  {
    id: "summary",
    label: "Summary",
    tabs: [
      { id: "cover", label: "Cover" },
      { id: "scenario", label: "Scenario" },
    ],
  },
  {
    id: "intake",
    label: "Intake",
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "borrowers", label: "Borrowers" },
      { id: "guarantors", label: "Guarantors" },
      { id: "business", label: "Business / Entity" },
      { id: "property", label: "Property" },
      { id: "loans", label: "Loans" },
      { id: "income", label: "Income" },
      { id: "assets", label: "Assets & Liabilities" },
      { id: "household", label: "Household" },
    ],
  },
  {
    id: "commercial",
    label: "Commercial / Hard Money",
    tabs: [
      { id: "commercial", label: "Commercial / DSCR" },
      { id: "hardmoney", label: "Hard Money" },
      { id: "reo", label: "Schedule of REO" },
    ],
  },
  {
    id: "analysis",
    label: "Analysis",
    tabs: [{ id: "analysis", label: "Calculators & tools" }],
  },
  {
    id: "close",
    label: "Closing",
    tabs: [
      { id: "fees", label: "Fees & Closing" },
      { id: "workflow", label: "Workflow" },
      { id: "notes", label: "Notes" },
    ],
  },
] as const;

export type DealTabId = (typeof DEAL_TAB_GROUPS)[number]["tabs"][number]["id"];
