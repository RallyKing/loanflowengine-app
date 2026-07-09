/**
 * Phase 15 Step 4 — hub projection modes (client-side, single subscription).
 */
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import type { PipelineRowGraphLinks } from "@/convex/pipelineGraphPreviewLinks";
import type { LinkedClientSummary } from "@/lib/pipelineClientRelationships";
import type { ClientRelationshipType } from "@/lib/pipelineClientRelationships";
import {
  buildHubHierarchyTree,
  hubRowClientKey,
  hubRowProjectKey,
  type HubClientNode,
  type HubLoanNode,
  type HubProjectNode,
} from "@/lib/pipeline/hubHierarchyTree";
import type { PipelineHubSortKey } from "@/lib/pipeline/pipelineHubPersistence";
import {
  contactQualifiesForReferralHub,
  isReferralPartnerGraphLink,
  isReferralPartnerRoleId,
} from "@/lib/contact/contactRoles";
import {
  buildPipelineStageIndex,
  resolveRowStageWeight,
} from "@/hooks/useOrganizationPipelineStages";

export type HubProjectionMode =
  | "client"
  | "project"
  | "file"
  | "lender"
  | "referral"
  | "team"
  | "task";

export const HUB_PROJECTION_MODES: HubProjectionMode[] = [
  "client",
  "project",
  "file",
  "lender",
  "referral",
  "team",
  "task",
];

export const HUB_PROJECTION_MODE_LABELS: Record<HubProjectionMode, string> = {
  client: "Client Focus",
  project: "Project Focus",
  file: "Loan File Focus",
  lender: "Lender Focus",
  referral: "Referral Partner Focus",
  team: "Team Member Focus",
  task: "Task Focus",
};

export const DEFAULT_HUB_PROJECTION_MODE: HubProjectionMode = "client";

export function isHubProjectionMode(v: string): v is HubProjectionMode {
  return (HUB_PROJECTION_MODES as string[]).includes(v);
}

function dedupeGraphClientLinks(
  links: PipelineRowGraphLinks["clients"],
): PipelineRowGraphLinks["clients"] {
  const seen = new Set<string>();
  const out: PipelineRowGraphLinks["clients"] = [];
  for (const l of links) {
    const key = `${l.id}:${l.relationshipType ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

/** Merge server graph links with row `linkedClients` / `projectLinkedClients` (client-side only). */
export function graphLinksForRow(
  row: PipelineTablePreviewRow,
): PipelineRowGraphLinks {
  const base = row.graphLinks ?? {
    clients: [] as PipelineRowGraphLinks["clients"],
    projects: [] as PipelineRowGraphLinks["projects"],
    lenders: [],
    referrals: [],
    team: [],
    tasks: [],
  };

  const clientsFromRow = [
    ...(row.linkedClients ?? []).map((lc) => ({
      id: String(lc.clientId),
      label: lc.displayName,
      relationshipType: lc.relationshipType,
    })),
    ...(row.projectLinkedClients ?? []).map((lc) => ({
      id: String(lc.clientId),
      label: lc.displayName,
      relationshipType: lc.relationshipType,
    })),
  ];

  let clients = dedupeGraphClientLinks([...base.clients, ...clientsFromRow]);
  if (clients.length === 0 && row.clientId) {
    clients = [
      {
        id: String(row.clientId),
        label: row.clientDisplayName ?? "Client",
        relationshipType: "primary",
      },
    ];
  }

  let projects = base.projects;
  if (projects.length === 0 && row.projectId) {
    projects = [
      {
        id: String(row.projectId),
        label: row.projectDisplayTitle ?? "Project",
        relationshipType: "primary",
      },
    ];
  }

  return {
    clients,
    projects,
    lenders: base.lenders,
    referrals: base.referrals,
    team: base.team,
    tasks: base.tasks,
  };
}

function clientPlacementForFile(
  row: PipelineTablePreviewRow,
  clientId: string,
  clientRef?: PipelineRowGraphLinks["clients"][number],
): import("@/lib/pipeline/hubHierarchyTree").HubLoanClientPlacement {
  const fromLink = row.linkedClients?.find(
    (l) => String(l.clientId) === clientId,
  )?.relationshipType;
  const relationshipType = (clientRef?.relationshipType ??
    fromLink ??
    (row.clientId != null && String(row.clientId) === clientId
      ? "primary"
      : "other")) as ClientRelationshipType;
  const isPrimary =
    relationshipType === "primary" ||
    (row.clientId != null && String(row.clientId) === clientId);
  return { clientId, relationshipType, isPrimary };
}

export type GraphProjectionIndex = {
  rowById: Map<string, PipelineTablePreviewRow>;
  clientToFileIds: Map<string, Set<string>>;
  projectToFileIds: Map<string, Set<string>>;
  lenderToFileIds: Map<string, Set<string>>;
  referralToFileIds: Map<string, Set<string>>;
  teamToFileIds: Map<string, Set<string>>;
  taskToFileIds: Map<string, Set<string>>;
  clientLabels: Map<string, string>;
  projectLabels: Map<string, string>;
  lenderLabels: Map<string, string>;
  referralLabels: Map<string, string>;
  teamLabels: Map<string, string>;
  taskLabels: Map<string, string>;
};

export type ProjectionSortOptions = {
  sort: PipelineHubSortKey;
  stageIndex: ReturnType<typeof buildPipelineStageIndex>;
};

function isStageSort(sort: PipelineHubSortKey): sort is "stageAsc" | "stageDesc" {
  return sort === "stageAsc" || sort === "stageDesc";
}

function compareRowsByStage(
  a: PipelineTablePreviewRow,
  b: PipelineTablePreviewRow,
  opts: ProjectionSortOptions,
): number {
  const wa = resolveRowStageWeight(a, opts.stageIndex);
  const wb = resolveRowStageWeight(b, opts.stageIndex);
  if (wa !== wb) return opts.sort === "stageAsc" ? wa - wb : wb - wa;
  return b.updatedAt - a.updatedAt;
}

function groupMostAdvancedStageWeight(
  nodes: HubLoanNode[],
  opts: ProjectionSortOptions,
): number {
  let max = -Infinity;
  for (const n of nodes) {
    const w = resolveRowStageWeight(n.row, opts.stageIndex);
    if (w > max) max = w;
  }
  return Number.isFinite(max) ? max : 50_000;
}

export function buildGraphProjectionIndex(
  rows: PipelineTablePreviewRow[],
): GraphProjectionIndex {
  const rowById = new Map<string, PipelineTablePreviewRow>();
  const clientToFileIds = new Map<string, Set<string>>();
  const projectToFileIds = new Map<string, Set<string>>();
  const lenderToFileIds = new Map<string, Set<string>>();
  const referralToFileIds = new Map<string, Set<string>>();
  const teamToFileIds = new Map<string, Set<string>>();
  const taskToFileIds = new Map<string, Set<string>>();
  const clientLabels = new Map<string, string>();
  const projectLabels = new Map<string, string>();
  const lenderLabels = new Map<string, string>();
  const referralLabels = new Map<string, string>();
  const teamLabels = new Map<string, string>();
  const taskLabels = new Map<string, string>();

  const link = <T extends string>(
    map: Map<string, Set<string>>,
    entityId: T,
    fileId: string,
  ) => {
    const set = map.get(entityId) ?? new Set<string>();
    set.add(fileId);
    map.set(entityId, set);
  };

  for (const row of rows) {
    const fid = String(row._id);
    rowById.set(fid, row);
    const gl = graphLinksForRow(row); // merges graphLinks + linkedClients + FK fallback
    for (const c of gl.clients) {
      link(clientToFileIds, c.id, fid);
      clientLabels.set(c.id, c.label);
    }
    for (const p of gl.projects) {
      link(projectToFileIds, p.id, fid);
      projectLabels.set(p.id, p.label);
    }
    for (const l of gl.lenders) {
      if (l.relationshipType === "declined") continue;
      link(lenderToFileIds, l.id, fid);
      lenderLabels.set(l.id, l.label);
    }
    for (const r of gl.referrals) {
      if (!isReferralPartnerGraphLink(r)) continue;
      link(referralToFileIds, r.id, fid);
      referralLabels.set(r.id, r.label);
    }
    for (const t of gl.team) {
      link(teamToFileIds, t.id, fid);
      teamLabels.set(t.id, t.label);
    }
    for (const t of gl.tasks) {
      link(taskToFileIds, t.id, fid);
      taskLabels.set(t.id, t.label);
    }
  }

  return {
    rowById,
    clientToFileIds,
    projectToFileIds,
    lenderToFileIds,
    referralToFileIds,
    teamToFileIds,
    taskToFileIds,
    clientLabels,
    projectLabels,
    lenderLabels,
    referralLabels,
    teamLabels,
    taskLabels,
  };
}

function fileNodesForIds(
  index: GraphProjectionIndex,
  fileIds: Iterable<string>,
  opts?: ProjectionSortOptions,
): HubLoanNode[] {
  const nodes: HubLoanNode[] = [];
  const seen = new Set<string>();
  for (const fid of fileIds) {
    if (seen.has(fid)) continue;
    seen.add(fid);
    const row = index.rowById.get(fid);
    if (!row) continue;
    nodes.push({ row, fundingPriority: row.fundingAmount ?? 0 });
  }
  if (opts && isStageSort(opts.sort)) {
    nodes.sort((a, b) => compareRowsByStage(a.row, b.row, opts));
  } else {
    nodes.sort((a, b) => b.fundingPriority - a.fundingPriority);
  }
  return nodes;
}

/**
 * Client focus — multi-edge placement via `GraphProjectionIndex.clientToFileIds`
 * (fileClients + linkedClients graph), not primary FK alone.
 */
export function buildClientFocusTree(
  rows: PipelineTablePreviewRow[],
  index: GraphProjectionIndex,
  opts?: ProjectionSortOptions,
): HubClientNode[] {
  const clientMap = new Map<string, HubClientNode>();
  const rowById = index.rowById;

  const clientIds = new Set<string>(index.clientToFileIds.keys());
  for (const row of rows) {
    for (const c of graphLinksForRow(row).clients) {
      clientIds.add(c.id);
    }
  }

  for (const clientId of clientIds) {
    const fileIds =
      index.clientToFileIds.get(clientId) ??
      new Set(
        rows
          .filter((r) =>
            graphLinksForRow(r).clients.some((c) => c.id === clientId),
          )
          .map((r) => String(r._id)),
      );

    for (const fid of fileIds) {
      const row = rowById.get(fid);
      if (!row) continue;
      const gl = graphLinksForRow(row);
      const clientRef =
        gl.clients.find((c) => c.id === clientId) ??
        ({
          id: clientId,
          label:
            index.clientLabels.get(clientId) ??
            row.clientDisplayName ??
            "Client",
          relationshipType: "other",
        } as const);

      let client = clientMap.get(clientId);
      if (!client) {
        client = {
          clientId,
          displayName: clientRef.label,
          projects: [],
          projectCount: 0,
          loanCount: 0,
          aggregateFunding: 0,
          completionPercent: 0,
        };
        clientMap.set(clientId, client);
      }

      const pk = hubRowProjectKey(row);
      let project = client.projects.find((p) => p.projectId === pk);
      if (!project) {
        project = {
          projectId: row.projectId ? String(row.projectId) : pk,
          clientId,
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
      }

      if (!project.loans.some((l) => String(l.row._id) === fid)) {
        const funding = row.fundingAmount ?? 0;
        const placement = clientPlacementForFile(row, clientId, clientRef);
        project.loans.push({
          row,
          fundingPriority: funding,
          clientPlacement: placement,
        });
        project.loanCount += 1;
        project.stackFunding += funding;
        client.loanCount += 1;
        client.aggregateFunding += funding;
      }
    }
  }

  const clients = [...clientMap.values()];
  for (const client of clients) {
    for (const project of client.projects) {
      if (opts && isStageSort(opts.sort)) {
        project.loans.sort((a, b) => compareRowsByStage(a.row, b.row, opts));
      } else {
        project.loans.sort((a, b) => b.fundingPriority - a.fundingPriority);
      }
    }
    if (opts && isStageSort(opts.sort)) {
      client.projects.sort((a, b) => {
        const ka = groupMostAdvancedStageWeight(a.loans, opts);
        const kb = groupMostAdvancedStageWeight(b.loans, opts);
        if (ka !== kb) return opts.sort === "stageAsc" ? ka - kb : kb - ka;
        return a.title.localeCompare(b.title);
      });
    } else {
      client.projects.sort((a, b) => a.title.localeCompare(b.title));
    }
    client.projectCount = client.projects.length;
  }
  if (opts && isStageSort(opts.sort)) {
    clients.sort((a, b) => {
      const la = a.projects.flatMap((p) => p.loans);
      const lb = b.projects.flatMap((p) => p.loans);
      const ka = groupMostAdvancedStageWeight(la, opts);
      const kb = groupMostAdvancedStageWeight(lb, opts);
      if (ka !== kb) return opts.sort === "stageAsc" ? ka - kb : kb - ka;
      return a.displayName.localeCompare(b.displayName);
    });
  } else {
    clients.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return clients;
}

export type HubProjectFocusNode = HubProjectNode;

export function buildProjectFocusTree(
  rows: PipelineTablePreviewRow[],
  index?: GraphProjectionIndex,
  opts?: ProjectionSortOptions,
): HubProjectFocusNode[] {
  const projectMap = new Map<string, HubProjectFocusNode>();
  const idx = index ?? buildGraphProjectionIndex(rows);

  const projectKeys = new Set<string>(idx.projectToFileIds.keys());
  for (const row of rows) {
    projectKeys.add(hubRowProjectKey(row));
  }

  for (const pk of projectKeys) {
    const fileIds =
      idx.projectToFileIds.get(pk) ??
      new Set(
        rows
          .filter((r) => hubRowProjectKey(r) === pk)
          .map((r) => String(r._id)),
      );

    for (const fid of fileIds) {
      const row = idx.rowById.get(fid);
      if (!row) continue;

      let project = projectMap.get(pk);
      if (!project) {
        project = {
          projectId: row.projectId ? String(row.projectId) : pk,
          clientId: row.clientId ? String(row.clientId) : hubRowClientKey(row),
          title:
            idx.projectLabels.get(pk) ??
            row.projectDisplayTitle?.trim() ??
            "Project",
          projectLinkedClients: row.projectLinkedClients ?? [],
          loans: [],
          loanCount: 0,
          stackFunding: 0,
          completionPercent: 0,
          activeStageMix: {},
          capitalRollup: row.projectCapitalRollup,
        };
        projectMap.set(pk, project);
      }

      if (!project.loans.some((l) => String(l.row._id) === fid)) {
        const funding = row.fundingAmount ?? 0;
        project.loans.push({ row, fundingPriority: funding });
        project.loanCount += 1;
        project.stackFunding += funding;
      }

      const gl = graphLinksForRow(row);
      const clientById = new Map(
        project.projectLinkedClients.map((c) => [c.clientId, c]),
      );
      for (const c of gl.clients) {
        if (!clientById.has(c.id)) {
          clientById.set(c.id, {
            clientId: c.id,
            displayName: c.label,
            normalizedName: c.label.toLowerCase(),
            relationshipType: (c.relationshipType ??
              "other") as ClientRelationshipType,
            sortOrder: 50,
            isAuthoritativePrimary: c.relationshipType === "primary",
          });
        }
      }
      project.projectLinkedClients = [...clientById.values()].sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      );
    }
  }

  const projects = [...projectMap.values()];
  for (const p of projects) {
    if (opts && isStageSort(opts.sort)) {
      p.loans.sort((a, b) => compareRowsByStage(a.row, b.row, opts));
    } else {
      p.loans.sort((a, b) => b.fundingPriority - a.fundingPriority);
    }
  }
  if (opts && isStageSort(opts.sort)) {
    projects.sort((a, b) => {
      const ka = groupMostAdvancedStageWeight(a.loans, opts);
      const kb = groupMostAdvancedStageWeight(b.loans, opts);
      if (ka !== kb) return opts.sort === "stageAsc" ? ka - kb : kb - ka;
      return a.title.localeCompare(b.title);
    });
  } else {
    projects.sort((a, b) => a.title.localeCompare(b.title));
  }
  return projects;
}

export function buildFileFlatList(
  rows: PipelineTablePreviewRow[],
  opts?: ProjectionSortOptions,
): HubLoanNode[] {
  const seen = new Set<string>();
  const out: HubLoanNode[] = [];
  for (const row of rows) {
    const fid = String(row._id);
    if (seen.has(fid)) continue;
    seen.add(fid);
    out.push({ row, fundingPriority: row.fundingAmount ?? 0 });
  }
  if (opts && isStageSort(opts.sort)) {
    out.sort((a, b) => compareRowsByStage(a.row, b.row, opts));
  } else {
    out.sort((a, b) => b.fundingPriority - a.fundingPriority);
  }
  return out;
}

export type EntityFocusNode = {
  entityId: string;
  label: string;
  fileCount: number;
  loans: HubLoanNode[];
  /** Link-level CRM role id on the association (Phase 25.5). */
  contactRoleId?: string;
  /** Stored master `contacts.contactRoleIds` — Phase 25.7b hub gate. */
  canonicalContactRoleIds?: string[];
  /** @deprecated Phase 25.7b — use `canonicalContactRoleIds`. */
  canonicalContactRoleId?: string;
};

function buildEntityFocusNodes(
  index: GraphProjectionIndex,
  entityToFileIds: Map<string, Set<string>>,
  labels: Map<string, string>,
  opts?: ProjectionSortOptions,
): EntityFocusNode[] {
  const nodes: EntityFocusNode[] = [];
  for (const [entityId, fileIds] of entityToFileIds) {
    const loans = fileNodesForIds(index, fileIds, opts);
    if (loans.length === 0) continue;
    nodes.push({
      entityId,
      label: labels.get(entityId) ?? entityId,
      fileCount: loans.length,
      loans,
    });
  }
  if (opts && isStageSort(opts.sort)) {
    nodes.sort((a, b) => {
      const ka = groupMostAdvancedStageWeight(a.loans, opts);
      const kb = groupMostAdvancedStageWeight(b.loans, opts);
      if (ka !== kb) return opts.sort === "stageAsc" ? ka - kb : kb - ka;
      return a.label.localeCompare(b.label);
    });
  } else {
    nodes.sort((a, b) => a.label.localeCompare(b.label));
  }
  return nodes;
}

export function buildLenderFocusTree(
  index: GraphProjectionIndex,
  opts?: ProjectionSortOptions,
): EntityFocusNode[] {
  return buildEntityFocusNodes(
    index,
    index.lenderToFileIds,
    index.lenderLabels,
    opts,
  );
}

/**
 * Referral Partner hub tree — only partners with ≥1 active file in the current row set.
 * Groups files under each partner using strict `referral_partner` graph links (CFL-backed).
 */
export function buildReferralFocusTree(
  index: GraphProjectionIndex,
  opts?: ProjectionSortOptions,
): EntityFocusNode[] {
  const referralToFileIds = new Map<string, Set<string>>();
  const referralLabels = new Map<string, string>();
  const partnerRoleIds = new Map<string, string>();
  const partnerCanonicalRoles = new Map<string, string[]>();

  const linkReferral = (
    partnerId: string,
    fileId: string,
    label: string,
    contactRoleId: string,
    canonicalContactRoleIds: string[],
  ) => {
    if (!isReferralPartnerRoleId(contactRoleId)) return;
    if (!contactQualifiesForReferralHub({ contactRoleIds: canonicalContactRoleIds })) {
      return;
    }
    const set = referralToFileIds.get(partnerId) ?? new Set<string>();
    set.add(fileId);
    referralToFileIds.set(partnerId, set);
    referralLabels.set(partnerId, label);
    partnerRoleIds.set(partnerId, contactRoleId);
    partnerCanonicalRoles.set(partnerId, canonicalContactRoleIds);
  };

  for (const row of index.rowById.values()) {
    const fid = String(row._id);
    for (const ref of graphLinksForRow(row).referrals) {
      if (!isReferralPartnerGraphLink(ref)) continue;
      const canonicalIds =
        ref.canonicalContactRoleIds?.length
          ? ref.canonicalContactRoleIds
          : ref.canonicalContactRoleId?.trim()
            ? [ref.canonicalContactRoleId.trim()]
            : [];
      if (
        canonicalIds.length > 0 &&
        !contactQualifiesForReferralHub({ contactRoleIds: canonicalIds })
      ) {
        continue;
      }
      const roleId = ref.contactRoleId?.trim() ?? ref.relationshipType?.trim();
      if (!roleId || !isReferralPartnerRoleId(roleId)) continue;
      if (canonicalIds.length === 0) continue;
      linkReferral(ref.id, fid, ref.label, roleId, canonicalIds);
    }
  }

  const nodes = buildEntityFocusNodes(
    index,
    referralToFileIds,
    referralLabels,
    opts,
  );
  return nodes
    .filter((n) => {
      const canonical = partnerCanonicalRoles.get(n.entityId);
      return (
        isReferralPartnerRoleId(partnerRoleIds.get(n.entityId)) &&
        contactQualifiesForReferralHub({ contactRoleIds: canonical })
      );
    })
    .map((n) => {
      const canonicalIds = partnerCanonicalRoles.get(n.entityId) ?? [];
      return {
        ...n,
        contactRoleId: partnerRoleIds.get(n.entityId),
        canonicalContactRoleIds: canonicalIds,
        canonicalContactRoleId: canonicalIds[0],
      };
    });
}

export function buildTeamFocusTree(
  index: GraphProjectionIndex,
  opts?: ProjectionSortOptions,
): EntityFocusNode[] {
  return buildEntityFocusNodes(index, index.teamToFileIds, index.teamLabels, opts);
}

export type TaskFocusNode = {
  taskId: string;
  label: string;
  status: "open" | "done";
  fileId: string;
  fileName: string;
  row: PipelineTablePreviewRow;
};

export type TaskFocusTree = {
  open: TaskFocusNode[];
  completed: TaskFocusNode[];
};

/** @deprecated Use TaskFocusTree — file-grouped legacy shape. */
export type TaskFocusGroup = {
  fileId: string;
  fileName: string;
  row: PipelineTablePreviewRow;
  tasks: Array<{ id: string; label: string }>;
};

export function buildTaskFocusTree(
  rows: PipelineTablePreviewRow[],
  opts?: ProjectionSortOptions,
): TaskFocusTree {
  const open: TaskFocusNode[] = [];
  const completed: TaskFocusNode[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const gl = graphLinksForRow(row);
    for (const t of gl.tasks) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      const node: TaskFocusNode = {
        taskId: t.id,
        label: t.label,
        status: t.entityStatus === "done" ? "done" : "open",
        fileId: String(row._id),
        fileName: row.fileName,
        row,
      };
      if (node.status === "done") completed.push(node);
      else open.push(node);
    }
  }

  if (opts && isStageSort(opts.sort)) {
    const cmp = (a: TaskFocusNode, b: TaskFocusNode) => {
      const wa = resolveRowStageWeight(a.row, opts.stageIndex);
      const wb = resolveRowStageWeight(b.row, opts.stageIndex);
      if (wa !== wb) return opts.sort === "stageAsc" ? wa - wb : wb - wa;
      return a.label.localeCompare(b.label);
    };
    open.sort(cmp);
    completed.sort(cmp);
  } else {
    open.sort((a, b) => a.label.localeCompare(b.label));
    completed.sort((a, b) => a.label.localeCompare(b.label));
  }
  return { open, completed };
}

export function buildTaskFocusGroups(
  rows: PipelineTablePreviewRow[],
): TaskFocusGroup[] {
  const groups = new Map<string, TaskFocusGroup>();
  for (const row of rows) {
    const gl = graphLinksForRow(row);
    if (gl.tasks.length === 0) continue;
    const fid = String(row._id);
    groups.set(fid, {
      fileId: fid,
      fileName: row.fileName,
      row,
      tasks: gl.tasks.map((t) => ({ id: t.id, label: t.label })),
    });
  }
  return [...groups.values()].sort((a, b) =>
    a.fileName.localeCompare(b.fileName),
  );
}

/** Legacy default tree (primary client only) — kept for board parity. */
export function buildDefaultHierarchyTree(
  rows: PipelineTablePreviewRow[],
  mode: HubProjectionMode,
  index: GraphProjectionIndex,
): HubClientNode[] {
  if (mode === "client") return buildClientFocusTree(rows, index);
  return buildHubHierarchyTree(rows);
}

export function projectionSearchHaystack(
  row: PipelineTablePreviewRow,
  mode: HubProjectionMode,
): string {
  const base = row.searchText?.toLowerCase() ?? "";
  const gl = graphLinksForRow(row);
  const parts = [base];
  const add = (items: Array<{ label: string }>) => {
    for (const i of items) parts.push(i.label.toLowerCase());
  };
  switch (mode) {
    case "client":
      add(gl.clients);
      add(gl.projects);
      break;
    case "project":
      add(gl.projects);
      add(gl.clients);
      break;
    case "file":
      break;
    case "lender":
      add(gl.lenders);
      break;
    case "referral":
      add(gl.referrals.filter((r) => isReferralPartnerGraphLink(r)));
      break;
    case "team":
      add(gl.team);
      break;
    case "task":
      add(gl.tasks);
      break;
  }
  return parts.join(" ");
}

export function filterRowsForProjectionSearch(
  rows: PipelineTablePreviewRow[],
  query: string,
  mode: HubProjectionMode,
): PipelineTablePreviewRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => projectionSearchHaystack(r, mode).includes(q));
}

/** Phase 15 Step 5 — filter top-level projection entities only (zero Convex cost). */
function matchesTopLevelQuery(label: string, q: string): boolean {
  return label.toLowerCase().includes(q);
}

export function filterClientFocusTree(
  tree: HubClientNode[],
  query: string,
): HubClientNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return tree;
  return tree.filter((c) => matchesTopLevelQuery(c.displayName, q));
}

export function filterProjectFocusTree(
  tree: HubProjectFocusNode[],
  query: string,
): HubProjectFocusNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return tree;
  return tree.filter((p) => matchesTopLevelQuery(p.title, q));
}

export function filterFileFocusList(
  rows: PipelineTablePreviewRow[],
  query: string,
): PipelineTablePreviewRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    if (matchesTopLevelQuery(row.fileName, q)) return true;
    const gl = graphLinksForRow(row);
    return (
      gl.clients.some((c) => matchesTopLevelQuery(c.label, q)) ||
      gl.projects.some((p) => matchesTopLevelQuery(p.label, q))
    );
  });
}

export function filterEntityFocusTree(
  tree: EntityFocusNode[],
  query: string,
): EntityFocusNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return tree;
  return tree.filter((n) => matchesTopLevelQuery(n.label, q));
}

function isStrictReferralPartnerNode(node: EntityFocusNode): boolean {
  const canonical =
    node.canonicalContactRoleIds?.length
      ? node.canonicalContactRoleIds
      : node.canonicalContactRoleId?.trim()
        ? [node.canonicalContactRoleId.trim()]
        : [];
  return (
    isReferralPartnerRoleId(node.contactRoleId) &&
    contactQualifiesForReferralHub({ contactRoleIds: canonical })
  );
}

/** Referral Partner search: match partner name (keeps all nested files) or nested loan file names. */
export function filterReferralFocusTree(
  tree: EntityFocusNode[],
  query: string,
): EntityFocusNode[] {
  const strictTree = tree.filter(isStrictReferralPartnerNode);
  const q = query.trim().toLowerCase();
  if (!q) return strictTree;
  const out: EntityFocusNode[] = [];
  for (const node of strictTree) {
    if (matchesTopLevelQuery(node.label, q)) {
      out.push(node);
      continue;
    }
    const matchingLoans = node.loans.filter((loan) =>
      matchesTopLevelQuery(loan.row.fileName, q),
    );
    if (matchingLoans.length === 0) continue;
    out.push({
      ...node,
      loans: matchingLoans,
      fileCount: matchingLoans.length,
    });
  }
  return out;
}

export function filterTaskFocusTree(
  tree: TaskFocusTree,
  query: string,
): TaskFocusTree {
  const q = query.trim().toLowerCase();
  if (!q) return tree;
  const filterNodes = (nodes: TaskFocusNode[]) =>
    nodes.filter((n) => matchesTopLevelQuery(n.label, q));
  return {
    open: filterNodes(tree.open),
    completed: filterNodes(tree.completed),
  };
}

export function filterTaskFocusGroups(
  groups: TaskFocusGroup[],
  query: string,
): TaskFocusGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups.filter(
    (g) =>
      matchesTopLevelQuery(g.fileName, q) ||
      g.tasks.some((t) => matchesTopLevelQuery(t.label, q)),
  );
}

export function projectionTopLevelSearchPlaceholder(
  mode: HubProjectionMode,
): string {
  switch (mode) {
    case "client":
      return "Search clients…";
    case "project":
      return "Search projects…";
    case "file":
      return "Search loan files…";
    case "lender":
      return "Search lenders…";
    case "referral":
      return "Search referral partners…";
    case "team":
      return "Search team members…";
    case "task":
      return "Search tasks…";
  }
}

export function countUniqueCanonicalRows(nodes: EntityFocusNode[]): number {
  const seen = new Set<string>();
  for (const n of nodes) {
    for (const l of n.loans) seen.add(String(l.row._id));
  }
  return seen.size;
}

export function assertNoDuplicateRowsInFlatList(rows: HubLoanNode[]): boolean {
  const seen = new Set<string>();
  for (const n of rows) {
    const id = String(n.row._id);
    if (seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}
