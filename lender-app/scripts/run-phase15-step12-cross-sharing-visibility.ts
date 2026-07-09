#!/usr/bin/env npx tsx
/**
 * Phase 15 Step 12 — client-focus cross-sharing projection proof (local).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PipelineTablePreviewRow } from "../lib/pipelineTablePreview";
import {
  buildClientFocusTree,
  buildGraphProjectionIndex,
  graphLinksForRow,
} from "../lib/pipeline/graphProjection";
const __dirname = dirname(fileURLToPath(import.meta.url));
const reportsDir = join(__dirname, "..", "..", "migration-reports");
mkdirSync(reportsDir, { recursive: true });

const CLIENT_A = "client-a";
const CLIENT_B = "client-b";
const PROJECT_P = "project-p";
const FILE_1 = "file-1";

function fixtureRow(): PipelineTablePreviewRow {
  return {
    _id: FILE_1 as PipelineTablePreviewRow["_id"],
    fileName: "Shared Loan",
    status: "confirm_interest",
    fundingAmount: 100_000,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    _creationTime: Date.now(),
    lenders: [],
    contacts: [],
    canEditFile: true,
    ownership: null,
    hasEmbeddedDealData: false,
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
    fileNotesCount: 0,
    searchText: "shared loan client a client b",
    clientId: CLIENT_A as PipelineTablePreviewRow["clientId"],
    projectId: PROJECT_P as PipelineTablePreviewRow["projectId"],
    clientDisplayName: "Client A",
    projectDisplayTitle: "Project P",
    linkedClients: [
      {
        clientId: CLIENT_A,
        displayName: "Client A",
        normalizedName: "client a",
        relationshipType: "primary",
        sortOrder: 0,
        isAuthoritativePrimary: true,
      },
      {
        clientId: CLIENT_B,
        displayName: "Client B",
        normalizedName: "client b",
        relationshipType: "coborrower",
        sortOrder: 1,
        isAuthoritativePrimary: false,
      },
    ],
    graphLinks: {
      clients: [
        { id: CLIENT_A, label: "Client A", relationshipType: "primary" },
        { id: CLIENT_B, label: "Client B", relationshipType: "coborrower" },
      ],
      projects: [{ id: PROJECT_P, label: "Project P", relationshipType: "primary" }],
      lenders: [],
      referrals: [],
      team: [],
      tasks: [],
    },
  } as unknown as PipelineTablePreviewRow;
}

function fileUnderClient(tree: ReturnType<typeof buildClientFocusTree>, clientId: string) {
  const client = tree.find((c) => c.clientId === clientId);
  if (!client) return null;
  for (const p of client.projects) {
    const loan = p.loans.find((l) => String(l.row._id) === FILE_1);
    if (loan) return loan;
  }
  return null;
}

const row = fixtureRow();
const rows = [row];
const index = buildGraphProjectionIndex(rows);
const tree = buildClientFocusTree(rows, index);

const underA = fileUnderClient(tree, CLIENT_A);
const underB = fileUnderClient(tree, CLIENT_B);
const glClients = graphLinksForRow(row).clients.map((c) => c.id);

const pass =
  tree.length >= 2 &&
  underA != null &&
  underB != null &&
  underA.clientPlacement?.isPrimary === true &&
  underB.clientPlacement?.isPrimary === false &&
  underB.clientPlacement?.relationshipType === "coborrower" &&
  glClients.includes(CLIENT_A) &&
  glClients.includes(CLIENT_B);

const report = {
  generatedAt: new Date().toISOString(),
  phase: "15-step12-cross-sharing-visibility",
  pass,
  fixture: { CLIENT_A, CLIENT_B, FILE_1 },
  graphLinkClientIds: glClients,
  underClientA: {
    found: underA != null,
    isPrimary: underA?.clientPlacement?.isPrimary,
  },
  underClientB: {
    found: underB != null,
    relationshipType: underB?.clientPlacement?.relationshipType,
    isPrimary: underB?.clientPlacement?.isPrimary,
  },
  clientTreeSize: tree.length,
  productionUrl: "https://dlcfunds.vercel.app",
  manualProof: {
    joshuaPrimary:
      "Add Client B as secondary on File 1; hub Client Focus shows file under A (no badge) and B (Co-borrower badge); Linked Clients signpost references Change project",
  },
};

const outPath = join(reportsDir, "phase15-step12-cross-sharing-visibility.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!pass) process.exit(1);
