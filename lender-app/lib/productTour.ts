export type ProductTourStepId = "tasks" | "pipeline" | "files" | "contacts";

export type ProductTourStep = {
  id: ProductTourStepId;
  title: string;
  /** Shown when the nav target is visible. */
  tip: string;
  /** Shown when no `[data-product-tour]` node is found (layout / viewport). */
  fallbackTip: string;
};

/**
 * Ordered product tour — highlights `data-product-tour={id}` in the shell when present.
 */
export const PRODUCT_TOUR_STEPS: readonly ProductTourStep[] = [
  {
    id: "tasks",
    title: "Tasks",
    tip: "Start here for assignments, deadlines, and what to do next. Tasks stay scoped to your active organization.",
    fallbackTip:
      "Tasks is your home for work in progress. Use the home icon in the bottom bar (phone) or open Tasks in the left nav.",
  },
  {
    id: "pipeline",
    title: "Pipeline",
    tip: "Track every deal: stages, draw metrics, analytics, and ledger from the Pipeline section — your operational hub.",
    fallbackTip:
      "Pipeline groups your deal workspace. On a small screen, tap Pipeline in the bottom bar; on desktop, expand the green sidebar if it’s collapsed.",
  },
  {
    id: "files",
    title: "Pipeline files",
    tip: "Use Pipeline for the client → project → loan hierarchy and inline + creation on each row.",
    fallbackTip:
      "Client files live under Pipeline. Open the menu (☰), expand Pipeline, then tap Pipeline — or go to /pipeline.",
  },
  {
    id: "contacts",
    title: "Contacts",
    tip: "Store people and companies, then link them to files and lenders for a single source of truth.",
    fallbackTip:
      "Contacts lives in the left nav. On mobile, open the menu (☰) first; on the narrow desktop rail, use the people icon.",
  },
] as const;

export const PRODUCT_TOUR_STEP_COUNT = PRODUCT_TOUR_STEPS.length;
