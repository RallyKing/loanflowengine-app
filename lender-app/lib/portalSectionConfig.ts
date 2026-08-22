/**
 * Per-section configuration for portal page builder.
 * Stored on `PortalPageSectionInstance.props` — reused by builder + live portals.
 * Status steps use stable IDs so automations can subscribe later.
 */

import type { PortalPageSectionId } from "@/lib/portalPageSections";

export const PORTAL_STATUS_MODES = ["pipeline", "custom_checklist"] as const;
export type PortalStatusMode = (typeof PORTAL_STATUS_MODES)[number];

export const PORTAL_CONTACT_SOURCES = [
  "organization",
  "file_owner",
  "custom",
] as const;
export type PortalContactSource = (typeof PORTAL_CONTACT_SOURCES)[number];

export type PortalStatusStep = {
  /** Stable id for automation / progress rows — never reuse after delete. */
  id: string;
  label: string;
  description?: string;
  order?: number;
};

export type PortalCustomContact = {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
};

/**
 * Additive props bag. Unknown keys are stripped on sanitize.
 * Keep fields optional so older versions remain valid.
 */
export type PortalSectionProps = {
  titleOverride?: string;
  /** Welcome — overrides template welcomeMessage when set. Supports {{workspaceName}} {{fileLabel}}. */
  welcomeBody?: string;
  /** Status bar */
  statusMode?: PortalStatusMode;
  statusSteps?: PortalStatusStep[];
  /** Company primary contact */
  contactSource?: PortalContactSource;
  customContact?: PortalCustomContact;
  /** Chat — uses fileMessages (portal audience); intro shown above thread. */
  chatIntro?: string;
  chatEnabled?: boolean;
  /** Outstanding documents */
  docsEmptyMessage?: string;
  /** Start a new loan */
  ctaLabel?: string;
  ctaUrl?: string;
  ctaHelpText?: string;
  /** Notifications banner */
  bannerBody?: string;
  /** Search bar */
  searchPlaceholder?: string;
  /** Stat cards — up to 4 custom labels (values still from live context). */
  statLabels?: string[];
};

export function newPortalStatusStepId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `pst_${crypto.randomUUID()}`;
  }
  return `pst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultStatusSteps(): PortalStatusStep[] {
  return [
    {
      id: newPortalStatusStepId(),
      label: "Application received",
      description: "Your file is in our system",
      order: 0,
    },
    {
      id: newPortalStatusStepId(),
      label: "Documents in review",
      description: "We’re checking what you uploaded",
      order: 1,
    },
    {
      id: newPortalStatusStepId(),
      label: "Decision pending",
      description: "Final review with your broker",
      order: 2,
    },
  ];
}

export function defaultPropsForSection(
  sectionId: PortalPageSectionId,
): PortalSectionProps {
  switch (sectionId) {
    case "status_pipeline_stage":
      return {
        statusMode: "pipeline",
        statusSteps: defaultStatusSteps(),
      };
    case "company_primary_contact":
      return { contactSource: "organization" };
    case "chat":
      return {
        chatEnabled: true,
        chatIntro: "Message your broker — conversations appear on the loan file.",
      };
    case "start_new_loan":
      return {
        ctaLabel: "Start a new loan",
        ctaHelpText:
          "Contact your broker to open a fresh file, or use the link below if provided.",
      };
    case "outstanding_documents":
      return {
        docsEmptyMessage: "No outstanding document requests right now.",
      };
    case "notifications_banner":
      return {
        bannerBody: "Complete outstanding items so we can keep your file moving.",
      };
    case "search_bar":
      return {
        searchPlaceholder: "Search deals, documents, or contacts…",
      };
    case "stat_cards":
      return {
        statLabels: ["Open items", "Stage", "File", "Status"],
      };
    default:
      return {};
  }
}

function trimStr(raw: unknown, max: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().slice(0, max);
  return t.length > 0 ? t : undefined;
}

function sanitizeSteps(raw: unknown): PortalStatusStep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: PortalStatusStep[] = [];
  const seen = new Set<string>();
  for (const row of raw.slice(0, 24)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    let id = trimStr(r.id, 64);
    if (!id || seen.has(id)) id = newPortalStatusStepId();
    seen.add(id);
    const label = trimStr(r.label, 120);
    if (!label) continue;
    const description = trimStr(r.description, 240);
    const order =
      typeof r.order === "number" && Number.isFinite(r.order)
        ? Math.max(0, Math.min(999, Math.floor(r.order)))
        : out.length;
    out.push({
      id,
      label,
      order,
      ...(description ? { description } : {}),
    });
  }
  return out.length > 0
    ? out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : undefined;
}

export function sanitizePortalSectionProps(
  sectionId: PortalPageSectionId,
  raw: unknown,
): PortalSectionProps | undefined {
  const base = defaultPropsForSection(sectionId);
  if (!raw || typeof raw !== "object") {
    return Object.keys(base).length > 0 ? base : undefined;
  }
  const r = raw as Record<string, unknown>;
  const out: PortalSectionProps = { ...base };

  const titleOverride = trimStr(r.titleOverride, 120);
  if (titleOverride) out.titleOverride = titleOverride;
  else delete out.titleOverride;

  const welcomeBody = trimStr(r.welcomeBody, 2000);
  if (welcomeBody) out.welcomeBody = welcomeBody;

  if (sectionId === "status_pipeline_stage") {
    const mode = r.statusMode;
    out.statusMode =
      mode === "custom_checklist" || mode === "pipeline" ? mode : "pipeline";
    const steps = sanitizeSteps(r.statusSteps);
    out.statusSteps = steps ?? out.statusSteps ?? defaultStatusSteps();
  }

  if (sectionId === "company_primary_contact") {
    const src = r.contactSource;
    out.contactSource =
      src === "file_owner" || src === "custom" || src === "organization"
        ? src
        : "organization";
    if (r.customContact && typeof r.customContact === "object") {
      const c = r.customContact as Record<string, unknown>;
      out.customContact = {
        name: trimStr(c.name, 120),
        title: trimStr(c.title, 120),
        email: trimStr(c.email, 200),
        phone: trimStr(c.phone, 40),
      };
    }
  }

  if (sectionId === "chat") {
    const intro = trimStr(r.chatIntro, 500);
    if (intro) out.chatIntro = intro;
    if (typeof r.chatEnabled === "boolean") out.chatEnabled = r.chatEnabled;
  }

  if (sectionId === "outstanding_documents") {
    const msg = trimStr(r.docsEmptyMessage, 400);
    if (msg) out.docsEmptyMessage = msg;
  }

  if (sectionId === "start_new_loan") {
    const ctaLabel = trimStr(r.ctaLabel, 80);
    const ctaUrl = trimStr(r.ctaUrl, 500);
    const ctaHelpText = trimStr(r.ctaHelpText, 400);
    if (ctaLabel) out.ctaLabel = ctaLabel;
    if (ctaUrl) out.ctaUrl = ctaUrl;
    if (ctaHelpText) out.ctaHelpText = ctaHelpText;
  }

  if (sectionId === "notifications_banner") {
    const bannerBody = trimStr(r.bannerBody, 500);
    if (bannerBody) out.bannerBody = bannerBody;
  }

  if (sectionId === "search_bar") {
    const searchPlaceholder = trimStr(r.searchPlaceholder, 120);
    if (searchPlaceholder) out.searchPlaceholder = searchPlaceholder;
  }

  if (sectionId === "stat_cards" && Array.isArray(r.statLabels)) {
    const labels = r.statLabels
      .map((x) => trimStr(x, 40))
      .filter((x): x is string => Boolean(x))
      .slice(0, 4);
    if (labels.length > 0) out.statLabels = labels;
  }

  return out;
}

/** Apply {{workspaceName}} / {{fileLabel}} tokens in welcome copy. */
export function applyPortalWelcomeTokens(
  template: string,
  vars: { workspaceName?: string; fileLabel?: string },
): string {
  return template
    .replace(/\{\{\s*workspaceName\s*\}\}/gi, vars.workspaceName?.trim() || "your team")
    .replace(/\{\{\s*fileLabel\s*\}\}/gi, vars.fileLabel?.trim() || "your loan file");
}

export function resolveContactFromSectionProps(
  props: PortalSectionProps | undefined,
  fallback: {
    name: string;
    title?: string;
    email?: string;
    phone?: string;
  } | null | undefined,
): {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
} {
  if (props?.contactSource === "custom" && props.customContact) {
    const c = props.customContact;
    return {
      name: c.name?.trim() || fallback?.name || "Primary contact",
      title: c.title?.trim() || fallback?.title,
      email: c.email?.trim() || fallback?.email,
      phone: c.phone?.trim() || fallback?.phone,
    };
  }
  return {
    name: fallback?.name ?? "Your lending team",
    title: fallback?.title,
    email: fallback?.email,
    phone: fallback?.phone,
  };
}

/** Event shape for future automations (completion of a custom status step). */
export type PortalStatusStepCompletedEvent = {
  type: "portal.status_step.completed";
  stepId: string;
  sectionInstanceId: string;
  pipelineFileId?: string;
  portalDefaultId?: string;
  completedAt: number;
};
