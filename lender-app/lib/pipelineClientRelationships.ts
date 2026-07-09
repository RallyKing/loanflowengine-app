/**
 * Phase 14 Step 1 — multi-client relationship types (shared Convex + app).
 */

export const CLIENT_RELATIONSHIP_TYPES = [
  "primary",
  "coborrower",
  "guarantor",
  "entity",
  "sponsor",
  "partner",
  "other",
] as const;

export type ClientRelationshipType = (typeof CLIENT_RELATIONSHIP_TYPES)[number];

export type LinkedClientSummary = {
  clientId: string;
  displayName: string;
  normalizedName: string;
  relationshipType: ClientRelationshipType;
  sortOrder: number;
  /** True when this row mirrors `projects.clientId` or `pipeline.clientId`. */
  isAuthoritativePrimary: boolean;
};

export function compareClientLinks(
  a: LinkedClientSummary,
  b: LinkedClientSummary,
): number {
  if (a.isAuthoritativePrimary !== b.isAuthoritativePrimary) {
    return a.isAuthoritativePrimary ? -1 : 1;
  }
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.displayName.localeCompare(b.displayName);
}
