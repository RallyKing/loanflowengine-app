import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { FileLenderLinkSummary } from "@/convex/fileLenders";

export type CoverLenderSnapshot = {
  name?: string;
  submission?: string;
  approval?: string;
  appraisal?: string;
  ctc?: string;
  docsOut?: string;
  funded?: string;
};

export type LenderMilestoneKey =
  | "submission"
  | "approval"
  | "appraisal"
  | "ctc"
  | "docsOut"
  | "funded"
  | "sentToLender";

export type LenderMilestoneCell = {
  key: LenderMilestoneKey;
  label: string;
  value?: string;
};

export const COVER_MILESTONE_FIELDS: ReadonlyArray<{
  key: Exclude<LenderMilestoneKey, "sentToLender">;
  label: string;
}> = [
  { key: "submission", label: "Submission" },
  { key: "approval", label: "Approval" },
  { key: "appraisal", label: "Appraisal" },
  { key: "ctc", label: "CTC" },
  { key: "docsOut", label: "Docs out" },
  { key: "funded", label: "Funded" },
];

export type LenderTrackRow = {
  lenderId: Id<"lenders">;
  company: string;
  contactName?: string;
  relationshipType: Doc<"fileLenders">["relationshipType"];
  rejectionReason?: string;
  isSelected: boolean;
  milestones: LenderMilestoneCell[];
  termSummary?: string;
};

function normalizeLenderKey(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function findCoverLenderForCompany(
  coverLenders: CoverLenderSnapshot[],
  company: string,
  indexInFile: number,
): CoverLenderSnapshot | undefined {
  const target = normalizeLenderKey(company);
  if (target) {
    const byName = coverLenders.find(
      (row) => normalizeLenderKey(row.name) === target,
    );
    if (byName) return byName;
    const fuzzy = coverLenders.find((row) => {
      const name = normalizeLenderKey(row.name);
      return name && (name.includes(target) || target.includes(name));
    });
    if (fuzzy) return fuzzy;
  }
  return coverLenders[indexInFile];
}

export function resolveLenderRelationshipType(
  lenderId: Id<"lenders">,
  selectedLenderId: Id<"lenders"> | undefined | null,
  link: Pick<FileLenderLinkSummary, "relationshipType"> | undefined,
): Doc<"fileLenders">["relationshipType"] {
  if (link?.relationshipType) return link.relationshipType;
  if (
    selectedLenderId != null &&
    String(selectedLenderId) === String(lenderId)
  ) {
    return "selected";
  }
  return "quoted";
}

function formatSentToLenderDate(ms: number | undefined): string | undefined {
  if (ms == null || !Number.isFinite(ms)) return undefined;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(ms));
  } catch {
    return undefined;
  }
}

function summarizeTermOptions(
  termOptions: Doc<"pipeline">["termOptions"],
): string | undefined {
  if (!termOptions?.length) return undefined;
  const first = termOptions[0];
  if (!first) return undefined;
  const parts: string[] = [];
  if (first.rate?.trim()) parts.push(`${first.rate.trim()} rate`);
  if (first.term?.trim()) parts.push(first.term.trim());
  if (first.fundingTimeframe?.trim()) {
    parts.push(`Fund ${first.fundingTimeframe.trim()}`);
  }
  if (termOptions.length > 1) {
    parts.push(`+${termOptions.length - 1} option${termOptions.length === 2 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function buildLenderTrackRows(args: {
  lenders: Doc<"lenders">[];
  lenderOrder: Id<"lenders">[];
  links: FileLenderLinkSummary[];
  selectedLenderId?: Id<"lenders"> | null;
  selectedLenderSentAt?: number;
  termOptions?: Doc<"pipeline">["termOptions"];
  coverLenders?: CoverLenderSnapshot[];
}): LenderTrackRow[] {
  const linkById = new Map<string, FileLenderLinkSummary>();
  for (const link of args.links) {
    linkById.set(String(link.lenderId), link);
  }

  const lenderById = new Map<string, Doc<"lenders">>();
  for (const lender of args.lenders) {
    lenderById.set(String(lender._id), lender);
  }

  const orderedLenders = args.lenderOrder
    .map((id) => lenderById.get(String(id)))
    .filter((l): l is Doc<"lenders"> => l != null);

  const termSummary = summarizeTermOptions(args.termOptions);

  return orderedLenders.map((lender, index) => {
    const link = linkById.get(String(lender._id));
    const relationshipType = resolveLenderRelationshipType(
      lender._id,
      args.selectedLenderId,
      link,
    );
    const isSelected =
      args.selectedLenderId != null &&
      String(args.selectedLenderId) === String(lender._id);
    const cover = findCoverLenderForCompany(
      args.coverLenders ?? [],
      lender.company ?? "",
      index,
    );

    const milestones: LenderMilestoneCell[] = COVER_MILESTONE_FIELDS.map(
      ({ key, label }) => ({
        key,
        label,
        value: cover?.[key]?.trim() || undefined,
      }),
    );

    if (isSelected) {
      const sent = formatSentToLenderDate(args.selectedLenderSentAt);
      if (sent) {
        milestones.unshift({
          key: "sentToLender",
          label: "Sent to lender",
          value: sent,
        });
      }
    }

    return {
      lenderId: lender._id,
      company: lender.company?.trim() || "Unnamed lender",
      contactName: lender.contactName?.trim() || undefined,
      relationshipType,
      rejectionReason: link?.rejectionReason,
      isSelected,
      milestones,
      termSummary: isSelected ? termSummary : undefined,
    };
  });
}

export function sortLenderTrackRows(rows: LenderTrackRow[]): LenderTrackRow[] {
  const rank = (row: LenderTrackRow): number => {
    if (row.isSelected) return 0;
    if (row.relationshipType === "submitted") return 1;
    if (row.relationshipType === "selected") return 2;
    if (row.relationshipType === "syndication_partner") return 3;
    if (row.relationshipType === "sub_lender") return 4;
    if (row.relationshipType === "partner_group") return 5;
    if (row.relationshipType === "quoted") return 6;
    if (row.relationshipType === "other") return 7;
    if (row.relationshipType === "declined") return 8;
    return 9;
  };

  return [...rows].sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return a.company.localeCompare(b.company);
  });
}

export function relationshipTypeLabel(
  type: Doc<"fileLenders">["relationshipType"],
): string {
  switch (type) {
    case "quoted":
      return "Quoted";
    case "selected":
      return "Selected";
    case "submitted":
      return "Submitted";
    case "declined":
      return "Declined";
    case "syndication_partner":
      return "Syndication partner";
    case "sub_lender":
      return "Sub-lender";
    case "partner_group":
      return "Partner group";
    default:
      return "Other";
  }
}
