import type { Doc } from "../convex/_generated/dataModel";
import {
  allContactEmailStrings,
  allContactPhoneStrings,
} from "./contact/contactMethods";
import { effectiveContactRoleIdFromDoc } from "./contact/contactRoles";
import { parseClientMomentum } from "./clientMomentum";

const MAX_BLOB = 8000;

function str(x: unknown): string {
  if (typeof x === "string") return x.trim();
  if (x == null) return "";
  return String(x).trim();
}

/** Truncate for Convex search / storage. */
export function clampGlobalSearchBlob(s: string, max = MAX_BLOB): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

export function buildContactGlobalSearchText(
  row: Doc<"contacts">,
  primaryEntityDisplayName?: string,
): string {
  const companyLabel = primaryEntityDisplayName?.trim() || row.companyName;
  const parts = [
    row.name,
    row.email,
    row.phone,
    ...allContactEmailStrings(row),
    ...allContactPhoneStrings(row),
    ...(row.emails ?? []).map((e) => e.label),
    ...(row.phones ?? []).map((p) => p.label),
    row.notes,
    companyLabel,
    effectiveContactRoleIdFromDoc(row),
    ...(row.labels ?? []),
    ...(row.crmRelationshipTypes ?? []),
  ];
  return clampGlobalSearchBlob(
    parts.filter((p) => typeof p === "string" && p.length > 0).join(" \n ").toLowerCase(),
  );
}

export function buildTaskGlobalSearchText(row: Doc<"tasks">): string {
  const parts: string[] = [row.title, row.description ?? ""];
  if (Array.isArray(row.checklist)) {
    for (const c of row.checklist) {
      if (c?.text) parts.push(c.text);
    }
  }
  if (Array.isArray(row.links)) {
    for (const l of row.links) {
      if (l?.label) parts.push(l.label);
      if (l?.url) parts.push(l.url);
    }
  }
  if (Array.isArray(row.errandLocations)) {
    for (const loc of row.errandLocations) {
      if (loc?.name) parts.push(loc.name);
      for (const it of loc.items ?? []) {
        if (it?.name) parts.push(it.name);
        if (it?.note) parts.push(it.note);
      }
    }
  }
  if (row.assigneeId) parts.push(row.assigneeId);
  return clampGlobalSearchBlob(
    parts.filter((p) => p && p.length > 0).join(" \n ").toLowerCase(),
  );
}

export function buildPipelineGlobalSearchText(
  row: Doc<"pipeline">,
  /** Phase 14 — additional linked client display names for search indexing. */
  linkedClientDisplayNames: string[] = [],
): string {
  const cm = parseClientMomentum(row.clientMomentum);
  const parts: string[] = [
    row.fileName,
    row.status,
    ...linkedClientDisplayNames,
    row.notes ?? "",
    row.scenario ?? "",
    row.propertyAddress ?? "",
    row.term ?? "",
    row.assigneeId ?? "",
    row.loNmls ?? "",
    row.brokerNmls ?? "",
    ...(cm !== undefined
      ? [String(cm), "★".repeat(cm)]
      : ["unrated", "not rated", "client confidence"]),
  ];

  const crit = row.scenarioCriteria;
  if (crit && typeof crit === "object") {
    const c = crit as Record<string, unknown>;
    parts.push(
      str(c.fundingTypeLabel),
      str(c.propertyTypeLabel),
      str(c.state),
      str(c.transactionType),
      str(c.entityTypePreference),
      str(c.industry),
    );
  }

  const dd = row.dealData;
  if (dd && typeof dd === "object" && !Array.isArray(dd)) {
    const d = dd as Record<string, unknown>;
    parts.push(
      str(d.clientName),
      str(d.projectName),
      str(d.fileName),
      str(d.sourceType),
      str(d.fundingType),
    );
    const cover = d.cover;
    if (cover && typeof cover === "object" && !Array.isArray(cover)) {
      const cv = cover as Record<string, unknown>;
      parts.push(str(cv.program), str(cv.subjectProperty));
    }
    const sp = d.subjectProperty;
    if (sp && typeof sp === "object" && !Array.isArray(sp)) {
      const s = sp as Record<string, unknown>;
      parts.push(str(s.address), str(s.city), str(s.state));
    }
    const biz = d.business;
    if (biz && typeof biz === "object" && !Array.isArray(biz)) {
      const b = biz as Record<string, unknown>;
      parts.push(str(b.legalName), str(b.dba), str(b.fundingProduct));
    }
  }

  return clampGlobalSearchBlob(
    parts.filter((p) => p.length > 0).join(" \n ").toLowerCase(),
  );
}
