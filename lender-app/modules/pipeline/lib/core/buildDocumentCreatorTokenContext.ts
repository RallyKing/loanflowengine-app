import type { Doc } from "@/convex/_generated/dataModel";
import type { DealWorkspaceSheet } from "@/lib/file/dealSectionTypes";
import { personNameFromBorrowerRow } from "@/lib/contacts/borrowerIdentityFromDeal";
import { personNameFromGuarantorRow } from "@/lib/contacts/guarantorIdentityFromDeal";
import type { DocumentCreatorTokenContext } from "@/lib/pipeline/documentVaultCreator";

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatFundingAmount(amount: number | undefined): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "—";
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatPropertyRecord(
  record:
    | {
        address?: string;
        city?: string;
        state?: string;
        zip?: string;
      }
    | null
    | undefined,
): string {
  if (!record) return "";
  const parts = [
    str(record.address),
    [str(record.city), str(record.state)].filter(Boolean).join(", "),
    str(record.zip),
  ].filter(Boolean);
  return parts.join(parts.length > 2 ? ", " : " ").trim();
}

function primaryBorrowerName(
  dealSheet: DealWorkspaceSheet | null | undefined,
  pipeline: Doc<"pipeline"> | null | undefined,
): string {
  const borrowers = dealSheet?.borrowers;
  if (Array.isArray(borrowers) && borrowers.length > 0) {
    const name = personNameFromBorrowerRow(borrowers[0]);
    if (name) return name;
  }
  const clientName = str(dealSheet?.clientName);
  if (clientName) return clientName;
  const cover = dealSheet?.cover as { borrowers?: string } | undefined;
  const coverBorrowers = str(cover?.borrowers);
  if (coverBorrowers) return coverBorrowers.split(/[,;]/)[0]?.trim() ?? "";
  return "";
}

function primaryGuarantorName(
  dealSheet: DealWorkspaceSheet | null | undefined,
): string {
  const guarantors = dealSheet?.guarantors;
  if (Array.isArray(guarantors) && guarantors.length > 0) {
    const name = personNameFromGuarantorRow(guarantors[0]);
    if (name) return name;
  }
  return "";
}

function entityName(dealSheet: DealWorkspaceSheet | null | undefined): string {
  const business = dealSheet?.business as
    | { legalName?: string; dba?: string }
    | undefined;
  const legal = str(business?.legalName);
  if (legal) return legal;
  const dba = str(business?.dba);
  if (dba) return dba;
  return str(dealSheet?.clientName);
}

function propertyAddress(
  dealSheet: DealWorkspaceSheet | null | undefined,
  pipeline: Doc<"pipeline"> | null | undefined,
): string {
  const pipeAddr = str(pipeline?.propertyAddress);
  if (pipeAddr) return pipeAddr;

  const scenario = dealSheet?.scenario as { propertyAddress?: string } | undefined;
  const scenarioAddr = str(scenario?.propertyAddress);
  if (scenarioAddr) return scenarioAddr;

  const subject = formatPropertyRecord(
    dealSheet?.subjectProperty as Parameters<typeof formatPropertyRecord>[0],
  );
  if (subject) return subject;

  const cover = dealSheet?.cover as { subjectProperty?: string } | undefined;
  return str(cover?.subjectProperty);
}

function interestRateLabel(
  dealSheet: DealWorkspaceSheet | null | undefined,
  interestRateDisplay?: string,
): string {
  const display = str(interestRateDisplay);
  if (display) return display;

  const cover = dealSheet?.cover as { ratePct?: string } | undefined;
  const coverRate = str(cover?.ratePct);
  if (coverRate) return coverRate.includes("%") ? coverRate : `${coverRate}%`;

  const loans = dealSheet?.loans;
  if (Array.isArray(loans) && loans.length > 0) {
    const rate = str(loans[0]?.currentRate);
    if (rate) return rate.includes("%") ? rate : `${rate}%`;
  }
  return "—";
}

function loanTermLabel(dealSheet: DealWorkspaceSheet | null | undefined): string {
  const scenario = dealSheet?.scenario as { loanTermYears?: string } | undefined;
  const years = str(scenario?.loanTermYears);
  if (years) return years.includes("yr") ? years : `${years} yr`;

  const cover = dealSheet?.cover as { program?: string } | undefined;
  const program = str(cover?.program);
  if (program) return program;

  const loans = dealSheet?.loans;
  if (Array.isArray(loans) && loans.length > 0) {
    const rateType = str(loans[0]?.rateType);
    if (rateType) return rateType;
  }
  return "—";
}

function fundingFromDealSheet(
  dealSheet: DealWorkspaceSheet | null | undefined,
): number {
  const cover = dealSheet?.cover as
    | { fundingAmount?: string; loanAmount?: string }
    | undefined;
  const coverRaw = str(cover?.fundingAmount) || str(cover?.loanAmount);
  if (coverRaw) {
    const n = Number(coverRaw.replace(/[$,]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const scenario = dealSheet?.scenario as { proposedLoanAmount?: string } | undefined;
  const scenarioRaw = str(scenario?.proposedLoanAmount);
  if (scenarioRaw) {
    const n = Number(scenarioRaw.replace(/[$,]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export type BuildDocumentCreatorTokenContextArgs = {
  pipeline?: Doc<"pipeline"> | null;
  dealSheet?: DealWorkspaceSheet | null;
  dealPackageLabel?: string;
  resolvedFunding?: number;
  interestRateDisplay?: string;
  stageLabel?: string;
  chosenLenderLabel?: string;
};

/** Build live deal token values from pipeline row + intake sheet. */
export function buildDocumentCreatorTokenContext(
  args: BuildDocumentCreatorTokenContextArgs,
): DocumentCreatorTokenContext {
  const { pipeline, dealSheet } = args;
  const today = new Date().toLocaleDateString(undefined, { dateStyle: "medium" });

  const funding =
    args.resolvedFunding != null && args.resolvedFunding > 0
      ? args.resolvedFunding
      : fundingFromDealSheet(dealSheet ?? null) ||
        (typeof pipeline?.fundingAmount === "number" &&
        Number.isFinite(pipeline.fundingAmount)
          ? pipeline.fundingAmount
          : 0);

  const borrower = primaryBorrowerName(dealSheet ?? null, pipeline ?? null);
  const guarantor = primaryGuarantorName(dealSheet ?? null);
  const entity = entityName(dealSheet ?? null);
  const property = propertyAddress(dealSheet ?? null, pipeline ?? null);

  return {
    borrower_name: borrower || "—",
    guarantor_name: guarantor || "—",
    entity_name: entity || "—",
    loan_amount: formatFundingAmount(funding),
    interest_rate: interestRateLabel(dealSheet ?? null, args.interestRateDisplay),
    loan_term: loanTermLabel(dealSheet ?? null),
    property_address: property || "—",
    pipeline_stage: args.stageLabel?.trim() || "—",
    primary_lender: args.chosenLenderLabel?.trim() || "—",
    file_name: args.dealPackageLabel?.trim() || str(pipeline?.fileName) || "Deal Package",
    today_date: today,
  };
}
