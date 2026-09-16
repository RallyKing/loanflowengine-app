/**
 * Capital + client-involvement filters must not treat unknown deferred fields
 * as authoritative empty / match-all.
 * Run: npx tsx scripts/pipeline-hub-deferred-filter-tests.ts
 */
import assert from "node:assert/strict";
import { rowMatchesCapitalStackFilter } from "../modules/pipeline/lib/core/capitalStackFilters";
import { rowMatchesClientInvolvementFilter } from "../modules/pipeline/lib/core/clientRelationshipUi";
import type { ProjectCapitalRollup } from "../lib/projectCapitalStack";

const underfundedFilters = {
  fundingHealth: "underfunded" as const,
  sourceType: "any" as const,
  gapThreshold: 0,
};

const partialRollup: ProjectCapitalRollup = {
  projectId: "p1",
  totalRequired: 100,
  totalCommitted: 40,
  totalApproved: 40,
  totalFunded: 40,
  remainingGap: 60,
  fundingCoveragePercent: 40,
  requirementCount: 1,
  sourceCount: 1,
  gapHealth: "partial",
  sourceTypes: ["loan"],
  searchBlob: "capital",
};

// Critical: missing rollup must NOT match underfunded (was match-all).
assert.equal(
  rowMatchesCapitalStackFilter({ projectCapitalRollup: undefined }, underfundedFilters),
  false,
);
assert.equal(
  rowMatchesCapitalStackFilter({ projectCapitalRollup: null }, underfundedFilters),
  false,
);
assert.equal(
  rowMatchesCapitalStackFilter(
    { projectCapitalRollup: partialRollup },
    underfundedFilters,
  ),
  true,
);
assert.equal(
  rowMatchesCapitalStackFilter(
    {
      projectCapitalRollup: { ...partialRollup, gapHealth: "complete", remainingGap: 0 },
    },
    underfundedFilters,
  ),
  false,
);

// Gap threshold: unknown rollup is not a match.
assert.equal(
  rowMatchesCapitalStackFilter(
    { projectCapitalRollup: undefined },
    { fundingHealth: "any", sourceType: "any", gapThreshold: 50_000 },
  ),
  false,
);

// Client involvement: unknown projectLinkedClients must not pretend empty.
assert.equal(
  rowMatchesClientInvolvementFilter(
    {
      linkedClients: [],
      projectLinkedClients: undefined,
    },
    { clientId: "c-project-only", relationshipType: "any", primaryOnly: false },
  ),
  false,
);
assert.equal(
  rowMatchesClientInvolvementFilter(
    {
      linkedClients: [],
      projectLinkedClients: [
        {
          clientId: "c-project-only",
          displayName: "Extra",
          relationshipType: "guarantor",
        },
      ],
    },
    { clientId: "c-project-only", relationshipType: "any", primaryOnly: false },
  ),
  true,
);
// Loan FK still matches while project links unknown.
assert.equal(
  rowMatchesClientInvolvementFilter(
    {
      clientId: "c-loan",
      linkedClients: [],
      projectLinkedClients: undefined,
    },
    { clientId: "c-loan", relationshipType: "any", primaryOnly: false },
  ),
  true,
);

console.log("pipeline-hub-deferred-filter-tests: OK");
