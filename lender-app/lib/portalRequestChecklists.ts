/**
 * Phase Modular-D — built-in portal document-request checklists.
 *
 * Consumed manually from the portal control room (`ClientPortalInviteBlock`)
 * via `api.clientPortalAdmin.applyRequestChecklist`. Phase E loan-strategy
 * templates reference the same item shape (`portalRequestChecklist[]`), so a
 * template can queue one of these automatically when a borrower is invited.
 */

export type PortalRequestChecklistItem = {
  title: string;
  description?: string;
  /** Vault subfolder for fulfilled uploads — found or created per file. */
  folderName?: string;
};

export type PortalRequestChecklist = {
  id: string;
  name: string;
  description: string;
  items: PortalRequestChecklistItem[];
};

export const PORTAL_REQUEST_CHECKLISTS: readonly PortalRequestChecklist[] = [
  {
    id: "standard-loan-docs",
    name: "Standard loan docs",
    description: "Core identity + financial docs requested on most files.",
    items: [
      {
        title: "Government-issued photo ID",
        description: "Driver's license or passport for each borrower/guarantor.",
        folderName: "Identity",
      },
      {
        title: "Last 2 months of bank statements",
        description: "All pages, all accounts used for reserves or down payment.",
        folderName: "Financials",
      },
      {
        title: "Personal financial statement",
        description: "Current PFS listing assets, liabilities, and net worth.",
        folderName: "Financials",
      },
      {
        title: "Entity documents",
        description:
          "Articles of organization, operating agreement, EIN letter, and certificate of good standing.",
        folderName: "Entity",
      },
    ],
  },
  {
    id: "construction-fix-flip",
    name: "Construction / Fix & Flip",
    description: "Deal docs for ground-up construction and rehab files.",
    items: [
      {
        title: "Executed purchase contract",
        description: "Fully executed contract with all addenda.",
        folderName: "Deal",
      },
      {
        title: "Construction budget / scope of work",
        description: "Line-item budget with costs per category.",
        folderName: "Construction",
      },
      {
        title: "Investment experience track record",
        description:
          "List of completed projects (address, purchase/sale price, dates, role).",
        folderName: "Experience",
      },
      {
        title: "Builder's risk insurance quote",
        description: "Quote or binder naming the lender as mortgagee.",
        folderName: "Insurance",
      },
    ],
  },
  {
    id: "working-capital",
    name: "Working capital",
    description: "Cash-flow documentation for working capital requests.",
    items: [
      {
        title: "Last 4 months of business bank statements",
        description: "All pages for the primary operating account.",
        folderName: "Financials",
      },
      {
        title: "Most recent business tax return",
        description: "Complete return with all schedules.",
        folderName: "Financials",
      },
      {
        title: "Accounts receivable aging report",
        description: "Current AR aging summary, if applicable.",
        folderName: "Financials",
      },
    ],
  },
];

export function getPortalRequestChecklist(
  id: string,
): PortalRequestChecklist | null {
  return PORTAL_REQUEST_CHECKLISTS.find((c) => c.id === id) ?? null;
}
