/**
 * Phase 15 Step 4 — graph link summaries embedded in `listTablePreview` rows.
 * ACL: only files already visible to the member are enriched.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  DEFAULT_CONTACT_ROLE_IDS,
  canonicalContactRoleIdsFromDoc,
  contactQualifiesForReferralHub,
  isReferralPartnerFileAssociation,
  isReferralPartnerRoleId,
} from "../lib/contact/contactRoles";

export type PipelineGraphEntityLink = {
  id: string;
  label: string;
  relationshipType?: string;
  /** CRM role id on this file↔contact link (association). */
  contactRoleId?: string;
  /** Stored master `contacts.contactRoleIds` at graph build time (Phase 25.7b). */
  canonicalContactRoleIds?: string[];
  /** @deprecated Phase 25.7b — first canonical id for legacy consumers. */
  canonicalContactRoleId?: string;
  /** Task status (`todo` | `done` | …) for Task Focus grouping. */
  entityStatus?: string;
};

export type PipelineRowGraphLinks = {
  clients: PipelineGraphEntityLink[];
  projects: PipelineGraphEntityLink[];
  lenders: PipelineGraphEntityLink[];
  referrals: PipelineGraphEntityLink[];
  team: PipelineGraphEntityLink[];
  tasks: PipelineGraphEntityLink[];
};

const EMPTY_LINKS: PipelineRowGraphLinks = {
  clients: [],
  projects: [],
  lenders: [],
  referrals: [],
  team: [],
  tasks: [],
};

function dedupeLinks(links: PipelineGraphEntityLink[]): PipelineGraphEntityLink[] {
  const seen = new Set<string>();
  const out: PipelineGraphEntityLink[] = [];
  for (const l of links) {
    const k = `${l.id}:${l.relationshipType ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

function mergeClientLinks(
  file: Doc<"pipeline">,
  junction: Array<{ clientId: Id<"clients">; relationshipType: string }>,
  clientNames: Map<string, string>,
  linkedFromHierarchy: Array<{
    clientId: string;
    displayName: string;
    relationshipType: string;
  }>,
): PipelineGraphEntityLink[] {
  const out: PipelineGraphEntityLink[] = [];
  if (file.clientId) {
    out.push({
      id: String(file.clientId),
      label: clientNames.get(String(file.clientId)) ?? "Client",
      relationshipType: "primary",
    });
  }
  for (const lc of linkedFromHierarchy) {
    out.push({
      id: lc.clientId,
      label: lc.displayName,
      relationshipType: lc.relationshipType,
    });
  }
  for (const j of junction) {
    const id = String(j.clientId);
    out.push({
      id,
      label: clientNames.get(id) ?? "Client",
      relationshipType: j.relationshipType,
    });
  }
  return dedupeLinks(out);
}

export async function batchGraphLinksForPipelineFiles(
  ctx: QueryCtx,
  files: Doc<"pipeline">[],
  organizationId: Id<"organizations">,
  hierarchyExtras: Array<{
    fileId: Id<"pipeline">;
    linkedFromHierarchy: Array<{
      clientId: string;
      displayName: string;
      relationshipType: string;
    }>;
    clientDisplayName: string;
    projectDisplayTitle: string;
  }>,
): Promise<Map<string, PipelineRowGraphLinks>> {
  const fileIdSet = new Set(files.map((f) => String(f._id)));
  const hierarchyByFile = new Map(
    hierarchyExtras.map((h) => [String(h.fileId), h]),
  );

  const orgStr = String(organizationId);
  const filterOrg = <T extends { organizationId: Id<"organizations"> }>(
    rows: T[],
  ) => rows.filter((r) => String(r.organizationId) === orgStr);

  const fcAll = filterOrg(await ctx.db.query("fileClients").collect()).filter(
    (r) => fileIdSet.has(String(r.fileId)),
  );
  const fpAll = filterOrg(await ctx.db.query("fileProjects").collect()).filter(
    (r) => fileIdSet.has(String(r.fileId)),
  );
  const flAll = filterOrg(await ctx.db.query("fileLenders").collect()).filter(
    (r) => fileIdSet.has(String(r.fileId)),
  );
  /** Phase 25.6 — referrals are CFL-only; junction table disabled for hub graph. */
  const frAll: Array<{
    fileId: Id<"pipeline">;
    contactId: Id<"contacts">;
  }> = [];
  const ftAll = filterOrg(await ctx.db.query("fileTeamMembers").collect()).filter(
    (r) => fileIdSet.has(String(r.fileId)),
  );
  const ftaskAll = filterOrg(await ctx.db.query("fileTasks").collect()).filter(
    (r) => fileIdSet.has(String(r.fileId)),
  );

  const clientIds = new Set<string>();
  const projectIds = new Set<string>();
  const lenderIds = new Set<string>();
  const contactIds = new Set<string>();
  const taskIds = new Set<string>();
  const userKeys = new Set<string>();

  for (const f of files) {
    if (f.clientId) clientIds.add(String(f.clientId));
    if (f.projectId) projectIds.add(String(f.projectId));
    for (const lid of f.lenders ?? []) lenderIds.add(String(lid));
    if (f.selectedLenderId) lenderIds.add(String(f.selectedLenderId));
    if (f.assigneeId?.trim()) userKeys.add(f.assigneeId.trim());
    for (const uk of f.sharedWithIds ?? []) {
      if (uk.trim()) userKeys.add(uk.trim());
    }
  }
  for (const r of fcAll) clientIds.add(String(r.clientId));
  for (const r of fpAll) projectIds.add(String(r.projectId));
  for (const r of flAll) lenderIds.add(String(r.lenderId));
  for (const r of frAll) contactIds.add(String(r.contactId));
  for (const r of ftaskAll) taskIds.add(String(r.taskId));
  for (const r of ftAll) userKeys.add(r.userKey.trim());

  const cflAll = (await ctx.db.query("contactFileLinks").collect()).filter((l) =>
    fileIdSet.has(String(l.fileId)),
  );
  for (const link of cflAll) {
    contactIds.add(String(link.contactId));
  }

  const orgTasks = (
    await ctx.db
      .query("tasks")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect()
  ).filter((t) => String(t.organizationId) === orgStr);
  for (const task of orgTasks) {
    if (!task.relatedFileId) continue;
    if (!fileIdSet.has(String(task.relatedFileId))) continue;
    taskIds.add(String(task._id));
  }

  const clientNames = new Map<string, string>();
  await Promise.all(
    [...clientIds].map(async (id) => {
      const doc = await ctx.db.get(id as Id<"clients">);
      if (doc) clientNames.set(id, doc.displayName?.trim() || "Client");
    }),
  );

  const projectNames = new Map<string, string>();
  await Promise.all(
    [...projectIds].map(async (id) => {
      const doc = await ctx.db.get(id as Id<"projects">);
      if (doc) projectNames.set(id, doc.title?.trim() || "Project");
    }),
  );

  const lenderNames = new Map<string, string>();
  await Promise.all(
    [...lenderIds].map(async (id) => {
      const doc = await ctx.db.get(id as Id<"lenders">);
      if (doc) {
        lenderNames.set(
          id,
          doc.company?.trim() || doc.contactName?.trim() || "Lender",
        );
      }
    }),
  );

  const contactNames = new Map<string, string>();
  const contactDocs = new Map<string, Doc<"contacts">>();
  const contactReferralFlags = new Map<string, boolean>();
  await Promise.all(
    [...contactIds].map(async (id) => {
      const doc = await ctx.db.get(id as Id<"contacts">);
      if (doc) {
        contactDocs.set(id, doc);
        contactNames.set(id, doc.name?.trim() || "Referral");
        contactReferralFlags.set(id, contactQualifiesForReferralHub(doc));
      }
    }),
  );

  const taskTitles = new Map<string, string>();
  const taskStatuses = new Map<string, string>();
  await Promise.all(
    [...taskIds].map(async (id) => {
      const doc = await ctx.db.get(id as Id<"tasks">);
      if (doc) {
        taskTitles.set(id, doc.title?.trim() || "Task");
        taskStatuses.set(id, doc.status);
      }
    }),
  );

  const memberLabels = new Map<string, string>();
  for (const uk of userKeys) {
    const authUser = await ctx.db.get(uk as Id<"authUsers">);
    if (authUser) {
      memberLabels.set(
        uk,
        authUser.displayUsername?.trim() || authUser.normalizedUsername || uk,
      );
    } else {
      memberLabels.set(uk, uk);
    }
  }

  const fcByFile = new Map<string, typeof fcAll>();
  for (const r of fcAll) {
    const fid = String(r.fileId);
    const list = fcByFile.get(fid) ?? [];
    list.push(r);
    fcByFile.set(fid, list);
  }
  const fpByFile = new Map<string, typeof fpAll>();
  for (const r of fpAll) {
    const fid = String(r.fileId);
    const list = fpByFile.get(fid) ?? [];
    list.push(r);
    fpByFile.set(fid, list);
  }
  const flByFile = new Map<string, typeof flAll>();
  for (const r of flAll) {
    const fid = String(r.fileId);
    const list = flByFile.get(fid) ?? [];
    list.push(r);
    flByFile.set(fid, list);
  }
  const frByFile = new Map<string, typeof frAll>();
  for (const r of frAll) {
    const fid = String(r.fileId);
    const list = frByFile.get(fid) ?? [];
    list.push(r);
    frByFile.set(fid, list);
  }
  const ftByFile = new Map<string, typeof ftAll>();
  for (const r of ftAll) {
    const fid = String(r.fileId);
    const list = ftByFile.get(fid) ?? [];
    list.push(r);
    ftByFile.set(fid, list);
  }
  const ftaskByFile = new Map<string, typeof ftaskAll>();
  for (const r of ftaskAll) {
    const fid = String(r.fileId);
    const list = ftaskByFile.get(fid) ?? [];
    list.push(r);
    ftaskByFile.set(fid, list);
  }

  const legacyTasksByFile = new Map<string, Doc<"tasks">[]>();
  for (const task of orgTasks) {
    if (!task.relatedFileId) continue;
    const fid = String(task.relatedFileId);
    if (!fileIdSet.has(fid)) continue;
    const list = legacyTasksByFile.get(fid) ?? [];
    list.push(task);
    legacyTasksByFile.set(fid, list);
  }

  const cflByFile = new Map<string, typeof cflAll>();
  for (const link of cflAll) {
    const fid = String(link.fileId);
    const list = cflByFile.get(fid) ?? [];
    list.push(link);
    cflByFile.set(fid, list);
  }

  const out = new Map<string, PipelineRowGraphLinks>();

  for (const file of files) {
    const fid = String(file._id);
    const hx = hierarchyByFile.get(fid);

    const clients = mergeClientLinks(
      file,
      fcByFile.get(fid) ?? [],
      clientNames,
      (hx?.linkedFromHierarchy ?? []).map((c) => ({
        clientId: String(c.clientId),
        displayName: c.displayName,
        relationshipType: c.relationshipType,
      })),
    );

    const projects: PipelineGraphEntityLink[] = dedupeLinks([
      ...(file.projectId
        ? [
            {
              id: String(file.projectId),
              label:
                projectNames.get(String(file.projectId)) ??
                hx?.projectDisplayTitle ??
                "Project",
              relationshipType: "primary",
            },
          ]
        : []),
      ...(fpByFile.get(fid) ?? []).map((p) => ({
        id: String(p.projectId),
        label: projectNames.get(String(p.projectId)) ?? "Project",
        relationshipType: p.relationshipType,
      })),
    ]);

    const lenderLinks: PipelineGraphEntityLink[] = [];
    const seenLenders = new Set<string>();
    const addLender = (id: string, rel?: string) => {
      if (seenLenders.has(id)) return;
      seenLenders.add(id);
      lenderLinks.push({
        id,
        label: lenderNames.get(id) ?? "Lender",
        relationshipType: rel,
      });
    };
    for (const j of flByFile.get(fid) ?? []) {
      if (j.relationshipType === "declined") continue;
      addLender(String(j.lenderId), j.relationshipType);
    }
    for (const lid of file.lenders ?? []) {
      const id = String(lid);
      const junction = (flByFile.get(fid) ?? []).find(
        (e) => String(e.lenderId) === id,
      );
      if (junction?.relationshipType === "declined") continue;
      const rel =
        file.selectedLenderId != null && String(file.selectedLenderId) === id
          ? "selected"
          : "quoted";
      addLender(id, rel);
    }

    const referrals: PipelineGraphEntityLink[] = [];
    const seenReferrals = new Set<string>();
    const addReferral = (
      id: string,
      label: string,
      contactRoleId: string,
      canonicalContactRoleIds: string[],
    ) => {
      if (seenReferrals.has(id)) return;
      if (!contactQualifiesForReferralHub({ contactRoleIds: canonicalContactRoleIds })) {
        return;
      }
      seenReferrals.add(id);
      referrals.push({
        id,
        label,
        relationshipType: DEFAULT_CONTACT_ROLE_IDS.referralPartner,
        contactRoleId,
        canonicalContactRoleIds,
        canonicalContactRoleId: canonicalContactRoleIds[0],
      });
    };
    for (const link of cflByFile.get(fid) ?? []) {
      const cid = String(link.contactId);
      const contact = contactDocs.get(cid) ?? null;
      if (!contact || !contactQualifiesForReferralHub(contact)) continue;
      if (
        !isReferralPartnerFileAssociation({
          linkContactRoleId: link.contactRoleId,
          contact,
        })
      ) {
        continue;
      }
      const canonicalIds = canonicalContactRoleIdsFromDoc(contact);
      const linkRoleId =
        link.contactRoleId?.trim() ??
        DEFAULT_CONTACT_ROLE_IDS.referralPartner;
      addReferral(
        cid,
        contactNames.get(cid) ?? "Referral",
        linkRoleId,
        canonicalIds,
      );
    }

    const team: PipelineGraphEntityLink[] = [];
    const seenTeam = new Set<string>();
    const addTeam = (uk: string, rel?: string) => {
      const key = uk.trim();
      if (!key || seenTeam.has(key)) return;
      seenTeam.add(key);
      team.push({
        id: key,
        label: memberLabels.get(key) ?? key,
        relationshipType: rel,
      });
    };
    for (const t of ftByFile.get(fid) ?? []) {
      addTeam(t.userKey, t.relationshipType);
    }
    if (file.assigneeId?.trim()) addTeam(file.assigneeId, "assignee");
    for (const uk of file.sharedWithIds ?? []) addTeam(uk, "shared");

    const tasks: PipelineGraphEntityLink[] = [];
    const seenTasks = new Set<string>();
    const addTask = (id: string, label: string, rel?: string, status?: string) => {
      if (seenTasks.has(id)) return;
      seenTasks.add(id);
      tasks.push({
        id,
        label,
        relationshipType: rel,
        entityStatus: status,
      });
    };
    for (const t of ftaskByFile.get(fid) ?? []) {
      const tid = String(t.taskId);
      addTask(
        tid,
        taskTitles.get(tid) ?? "Task",
        t.relationshipType,
        taskStatuses.get(tid),
      );
    }
    for (const task of legacyTasksByFile.get(fid) ?? []) {
      const tid = String(task._id);
      addTask(tid, task.title?.trim() || "Task", "related", task.status);
    }

    out.set(fid, {
      clients,
      projects,
      lenders: lenderLinks,
      referrals,
      team,
      tasks,
    });
  }

  for (const fid of fileIdSet) {
    if (!out.has(fid)) out.set(fid, { ...EMPTY_LINKS });
  }

  return out;
}
