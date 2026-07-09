import {
  CLIENT_RELATIONSHIP_TYPES,
  type ClientRelationshipType,
} from "@/lib/pipelineClientRelationships";

export const CLIENT_RELATIONSHIP_LABELS: Record<ClientRelationshipType, string> =
  {
    primary: "Primary",
    coborrower: "Co-borrower",
    guarantor: "Guarantor",
    entity: "Entity",
    sponsor: "Sponsor",
    partner: "Partner",
    other: "Other",
  };

export const SECONDARY_RELATIONSHIP_TYPES: ClientRelationshipType[] = [
  "coborrower",
  "guarantor",
  "entity",
  "sponsor",
  "partner",
  "other",
];

export function formatMultiClientSummary(
  primaryName: string,
  extraCount: number,
): string {
  if (extraCount <= 0) return primaryName;
  return `${primaryName} +${extraCount}`;
}

export function countExtraClients(
  linkedCount: number,
  includePrimaryInCount = true,
): number {
  if (linkedCount <= 0) return 0;
  return includePrimaryInCount ? Math.max(0, linkedCount - 1) : linkedCount;
}

export const PIPELINE_CLIENT_FILTER_STORAGE_KEY =
  "dlc.pipeline.hub.clientInvolvementFilters.v1";

export type PipelineClientInvolvementFilters = {
  clientId: string | null;
  relationshipType: ClientRelationshipType | "any";
  primaryOnly: boolean;
};

export const DEFAULT_PIPELINE_CLIENT_INVOLVEMENT_FILTERS: PipelineClientInvolvementFilters =
  {
    clientId: null,
    relationshipType: "any",
    primaryOnly: false,
  };

export function loadPipelineClientInvolvementFilters(): PipelineClientInvolvementFilters {
  if (typeof window === "undefined") {
    return DEFAULT_PIPELINE_CLIENT_INVOLVEMENT_FILTERS;
  }
  try {
    const raw = window.localStorage.getItem(PIPELINE_CLIENT_FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_PIPELINE_CLIENT_INVOLVEMENT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<PipelineClientInvolvementFilters>;
    return {
      clientId:
        typeof parsed.clientId === "string" ? parsed.clientId : null,
      relationshipType:
        parsed.relationshipType === "any"
          ? "any"
          : parsed.relationshipType &&
              CLIENT_RELATIONSHIP_TYPES.includes(
                parsed.relationshipType as ClientRelationshipType,
              )
            ? (parsed.relationshipType as ClientRelationshipType)
            : "any",
      primaryOnly: parsed.primaryOnly === true,
    };
  } catch {
    return DEFAULT_PIPELINE_CLIENT_INVOLVEMENT_FILTERS;
  }
}

export function savePipelineClientInvolvementFilters(
  filters: PipelineClientInvolvementFilters,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PIPELINE_CLIENT_FILTER_STORAGE_KEY,
      JSON.stringify(filters),
    );
  } catch {
    /* private mode */
  }
}

export type LinkedClientLike = {
  clientId: string;
  displayName: string;
  relationshipType: ClientRelationshipType;
  isAuthoritativePrimary?: boolean;
};

export function rowMatchesClientInvolvementFilter(
  row: {
    clientId?: string | null;
    linkedClients?: LinkedClientLike[];
    projectLinkedClients?: LinkedClientLike[];
  },
  filters: PipelineClientInvolvementFilters,
): boolean {
  if (!filters.clientId) return true;
  const target = filters.clientId;
  const loanLinks = row.linkedClients ?? [];
  const projectLinks = row.projectLinkedClients ?? [];
  const allLinks = [...loanLinks, ...projectLinks];
  const primaryOnly =
    filters.primaryOnly || filters.relationshipType === "primary";

  const matchesClient = (links: LinkedClientLike[]) =>
    links.some((l) => l.clientId === target) ||
    (row.clientId != null && String(row.clientId) === target);

  if (primaryOnly) {
    if (row.clientId != null && String(row.clientId) === target) return true;
    return linksHavePrimaryMatch(loanLinks, target) ||
      linksHavePrimaryMatch(projectLinks, target);
  }

  if (filters.relationshipType !== "any") {
    return allLinks.some(
      (l) =>
        l.clientId === target &&
        l.relationshipType === filters.relationshipType,
    ) || (
      filters.relationshipType === "primary" &&
      row.clientId != null &&
      String(row.clientId) === target
    );
  }

  return matchesClient(loanLinks) || matchesClient(projectLinks);
}

function linksHavePrimaryMatch(
  links: LinkedClientLike[],
  clientId: string,
): boolean {
  return links.some(
    (l) =>
      l.clientId === clientId &&
      (l.relationshipType === "primary" || l.isAuthoritativePrimary),
  );
}
