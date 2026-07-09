/**
 * Build Client → Project → Loan tree from `listTablePreview` rows (single subscription).
 */
import type { Id } from "@/convex/_generated/dataModel";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import type {
  ClientRelationshipType,
  LinkedClientSummary,
} from "@/lib/pipelineClientRelationships";
import type { ProjectCapitalRollup } from "@/lib/projectCapitalStack";
import {
  hubClientKeyFromRowFields,
  hubProjectKeyFromRowFields,
} from "@/lib/pipeline/hubHierarchyKeys";

/** How this loan row is linked to the client node it appears under (Phase 15 Step 12). */
export type HubLoanClientPlacement = {
  clientId: string;
  relationshipType: ClientRelationshipType;
  isPrimary: boolean;
};

export type HubLoanNode = {
  row: PipelineTablePreviewRow;
  /** Higher = shown first within project stack. */
  fundingPriority: number;
  /** Set when the loan is shown under a client via a graph edge (primary or secondary). */
  clientPlacement?: HubLoanClientPlacement;
};

export type HubProjectNode = {
  projectId: string;
  clientId: string;
  title: string;
  projectLinkedClients: LinkedClientSummary[];
  loans: HubLoanNode[];
  loanCount: number;
  stackFunding: number;
  completionPercent: number;
  activeStageMix: Record<string, number>;
  /** Phase 14 Step 3 — capital required / funded / gap health. */
  capitalRollup?: ProjectCapitalRollup;
};

export type HubClientNode = {
  clientId: string;
  displayName: string;
  projects: HubProjectNode[];
  projectCount: number;
  loanCount: number;
  aggregateFunding: number;
  completionPercent: number;
};

const TERMINAL_STATUSES = new Set([
  "paid",
  "paying",
  "funded",
  "closed",
  "complete",
  "completed",
  "cancelled",
  "canceled",
  "dead",
  "lost",
]);

function loanCompletionPercent(row: PipelineTablePreviewRow): number {
  const status = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (TERMINAL_STATUSES.has(status)) return 100;
  if (row.stageId) return 50;
  return 25;
}

export function hubRowClientKey(row: PipelineTablePreviewRow): string {
  return hubClientKeyFromRowFields(row);
}

export function hubRowProjectKey(row: PipelineTablePreviewRow): string {
  return hubProjectKeyFromRowFields(row);
}

export function buildHubHierarchyTree(
  rows: PipelineTablePreviewRow[],
): HubClientNode[] {
  const clientMap = new Map<string, HubClientNode>();

  for (const row of rows) {
    const ck = hubRowClientKey(row);
    let client = clientMap.get(ck);
    if (!client) {
      client = {
        clientId: row.clientId ? String(row.clientId) : ck,
        displayName: row.clientDisplayName?.trim() || "Borrower",
        projects: [],
        projectCount: 0,
        loanCount: 0,
        aggregateFunding: 0,
        completionPercent: 0,
      };
      clientMap.set(ck, client);
    }

    const pk = hubRowProjectKey(row);
    let project = client.projects.find((p) => p.projectId === pk);
    if (!project) {
      project = {
        projectId: row.projectId ? String(row.projectId) : pk,
        clientId: client.clientId,
        title: row.projectDisplayTitle?.trim() || "Project",
        projectLinkedClients: row.projectLinkedClients ?? [],
        loans: [],
        loanCount: 0,
        stackFunding: 0,
        completionPercent: 0,
        activeStageMix: {},
        capitalRollup: row.projectCapitalRollup,
      };
      client.projects.push(project);
    } else if (row.projectCapitalRollup && !project.capitalRollup) {
      project.capitalRollup = row.projectCapitalRollup;
    }

    const funding = row.fundingAmount ?? 0;
    project.loans.push({
      row,
      fundingPriority: funding,
    });
    project.loanCount += 1;
    project.stackFunding += funding;
    const stageKey = row.stageId
      ? String(row.stageId)
      : String(row.status ?? "unknown");
    project.activeStageMix[stageKey] =
      (project.activeStageMix[stageKey] ?? 0) + 1;
    client.loanCount += 1;
    client.aggregateFunding += funding;
  }

  const clients = [...clientMap.values()];
  for (const client of clients) {
    for (const project of client.projects) {
      project.loans.sort((a, b) => b.fundingPriority - a.fundingPriority);
      const sum = project.loans.reduce(
        (n, l) => n + loanCompletionPercent(l.row),
        0,
      );
      project.completionPercent =
        project.loans.length > 0
          ? Math.round(sum / project.loans.length)
          : 0;
    }
    client.projects.sort((a, b) => a.title.localeCompare(b.title));
    client.projectCount = client.projects.length;
    const allLoans = client.projects.flatMap((p) => p.loans);
    const sum = allLoans.reduce((n, l) => n + loanCompletionPercent(l.row), 0);
    client.completionPercent =
      allLoans.length > 0 ? Math.round(sum / allLoans.length) : 0;
  }

  clients.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return clients;
}

export type HierarchyScopeFilter = "all" | "client" | "project" | "loan";

export function filterRowsByHierarchyScope(
  rows: PipelineTablePreviewRow[],
  scope: HierarchyScopeFilter,
  clientId: string | null,
  projectId: string | null,
): PipelineTablePreviewRow[] {
  if (scope === "all" || !clientId) return rows;
  if (scope === "client") {
    return rows.filter((r) => hubRowClientKey(r) === clientId);
  }
  if (scope === "project" && projectId) {
    return rows.filter((r) => hubRowProjectKey(r) === projectId);
  }
  return rows;
}

export function fmtHubFunding(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
