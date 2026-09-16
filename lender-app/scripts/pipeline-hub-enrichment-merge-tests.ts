/**
 * Merge helper for deferred hub enrichment.
 * Run: npx tsx scripts/pipeline-hub-enrichment-merge-tests.ts
 */
import assert from "node:assert/strict";
import { mergeTablePreviewEnrichment } from "../modules/pipeline/lib/core/mergeTablePreviewEnrichment";
import type { PipelineTablePreviewRow } from "../lib/pipelineTablePreview";
import type { Id } from "../convex/_generated/dataModel";

function stubRow(
  id: string,
  extras: Partial<PipelineTablePreviewRow> = {},
): PipelineTablePreviewRow {
  return {
    _id: id as Id<"pipeline">,
    _creationTime: 1,
    createdAt: 1,
    fileName: "File",
    status: "lead",
    fundingAmount: 0,
    rate: 0,
    term: "",
    updatedAt: 1,
    lenders: [],
    commission: 0,
    netRevenue: 0,
    sourceLabel: "",
    subjectAddressDisplay: "",
    fundingTypeDisplay: "",
    fundingProgramDisplay: "",
    purchaseRefiDisplay: "",
    selectedLenderDisplay: "",
    selectedLenderSentDisplay: "",
    targetCloseDisplay: "",
    fundingAmountDisplay: "",
    netToUserDisplay: "",
    notesDisplay: "",
    // Deferred field unknown until enrichment
    searchText: "file lead",
    canEditFile: true,
    ownership: null,
    clientDisplayName: "Client",
    projectDisplayTitle: "Project",
    hasEmbeddedDealData: false,
    ...extras,
  };
}

const core = [stubRow("f1"), stubRow("f2")];
const mergedEmpty = mergeTablePreviewEnrichment(core, undefined);
assert.equal(mergedEmpty[0]!.fileNotesCount, undefined);
assert.equal(mergedEmpty[0]!.projectLinkedClients, undefined);
assert.equal(mergedEmpty[0]!.graphLinks, undefined);

const enriched = mergeTablePreviewEnrichment(core, [
  {
    fileId: "f1" as Id<"pipeline">,
    fileNotesCount: 3,
    graphLinks: {
      clients: [],
      projects: [],
      lenders: [],
      referrals: [],
      team: [],
      tasks: [],
    },
    projectCapitalRollup: {
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
      searchBlob: "capital hay",
    },
    projectLinkedClients: [
      {
        clientId: "c1",
        displayName: "Extra",
        normalizedName: "extra",
        relationshipType: "guarantor",
        sortOrder: 1,
        isAuthoritativePrimary: false,
      },
    ],
  },
]);

assert.equal(enriched[0]!.fileNotesCount, 3);
assert.ok(enriched[0]!.graphLinks);
assert.equal(enriched[0]!.projectCapitalRollup?.remainingGap, 60);
assert.equal(enriched[0]!.projectLinkedClients?.length, 1);
assert.match(enriched[0]!.searchText, /capital hay/);
// Unenriched sibling keeps unknown deferred fields (not coerced to 0/[]).
assert.equal(enriched[1]!.fileNotesCount, undefined);
assert.equal(enriched[1]!.graphLinks, undefined);
assert.equal(enriched[1]!.projectLinkedClients, undefined);

console.log("pipeline-hub-enrichment-merge-tests: OK");
