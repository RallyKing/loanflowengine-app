/**
 * Shared field definitions for the Lender record.
 * Used by the client UI, CSV parser, and Convex schema validators.
 */

import type { Id } from "@/convex/_generated/dataModel";
export const LENDER_FIELDS = [
  "source",
  "section",
  "company",
  "contactName",
  "titleRole",
  "phone",
  "email",
  "website",
  "entityType",
  "primaryNiche",
  "programs",
  "propertyTypes",
  "exclusions",
  "statesServed",
  "ownerOrInvestor",
  "fundingAmountMin",
  "fundingAmountMax",
  "minFico",
  "ltv",
  "interestRates",
  "amortTerm",
  "referralFees",
  "notes",
  "status",
  "lastUpdated",
] as const;

export type LenderField = (typeof LENDER_FIELDS)[number];

export interface Program {
  name: string;
  minFico?: string;
  requirements?: string;
}

export interface Contact {
  name: string;
  titleRole?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface PhoneNumber {
  label?: string;
  phone: string;
}

export interface Lender {
  _id?: string;
  source: string;
  section: string;
  company: string;
  contactName: string;
  titleRole: string;
  phone: string;
  email: string;
  website: string;
  entityType: string;
  primaryNiche: string;
  programs: string;
  propertyTypes: string;
  exclusions: string;
  statesServed: string;
  ownerOrInvestor: string;
  fundingAmountMin: string;
  fundingAmountMax: string;
  minFico: string;
  ltv: string;
  interestRates: string;
  amortTerm: string;
  referralFees: string;
  notes: string;
  status: string;
  lastUpdated: string;
  programList?: Program[];
  contacts?: Contact[];
  phoneNumbers?: PhoneNumber[];
  rating?: number;
  ratingNotes?: string;
  /** Org-owned lender row when using team hub. */
  organizationId?: Id<"organizations">;
  enrichedAt?: number;
  enrichmentStatus?: string;
  enrichmentSources?: string[];
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Pretty labels + the exact CSV header names from the Python pipeline's output.
 * This lets us import the existing Comprehensive_Lender_List.csv directly.
 */
export const FIELD_META: Record<
  LenderField,
  { label: string; csvHeader: string; hint?: string; multiline?: boolean }
> = {
  source: { label: "Source", csvHeader: "Source" },
  section: { label: "Section", csvHeader: "Section" },
  company: { label: "Company", csvHeader: "Company", hint: "Lender / firm name (required)" },
  contactName: { label: "Contact Name", csvHeader: "Contact Name" },
  titleRole: { label: "Title / Role", csvHeader: "Title / Role" },
  phone: { label: "Phone", csvHeader: "Phone" },
  email: { label: "Email", csvHeader: "Email" },
  website: { label: "Website", csvHeader: "Website" },
  entityType: {
    label: "Entity Type",
    csvHeader: "Entity Type",
    hint: "Leave blank to auto-classify",
  },
  primaryNiche: { label: "Primary Niche / Specialty", csvHeader: "Primary Niche / Specialty" },
  programs: { label: "Programs / Funding Types", csvHeader: "Programs / Funding Types" },
  propertyTypes: { label: "Property Types", csvHeader: "Property Types" },
  exclusions: { label: "Exclusions", csvHeader: "Exclusions" },
  statesServed: { label: "States Served", csvHeader: "States Served" },
  ownerOrInvestor: {
    label: "Owner-Occupied or Investor",
    csvHeader: "Owner-Occupied or Investor",
  },
  fundingAmountMin: { label: "Funding amount - Min", csvHeader: "Funding amount - Min" },
  fundingAmountMax: { label: "Funding amount - Max", csvHeader: "Funding amount - Max" },
  minFico: {
    label: "Min FICO (manual override)",
    csvHeader: "Min FICO",
    hint: "Numeric value (e.g. 680). Leave blank to use auto-detection from notes.",
  },
  ltv: { label: "LTV / Leverage", csvHeader: "LTV / Leverage" },
  interestRates: { label: "Interest Rates", csvHeader: "Interest Rates" },
  amortTerm: { label: "Amortization / Term", csvHeader: "Amortization / Term" },
  referralFees: { label: "Referral / YSP Fees", csvHeader: "Referral / YSP Fees" },
  notes: { label: "Additional Notes", csvHeader: "Additional Notes", multiline: true },
  status: { label: "Status", csvHeader: "Status" },
  lastUpdated: { label: "Last Updated", csvHeader: "Last Updated" },
};

export const ENTITY_TYPES = [
  "Bank / Commercial Lender",
  "Credit Union",
  "SBA / USDA Lender",
  "Hard Money / Bridge Lender",
  "Private / Hedge Fund",
  "Factoring / A/R",
  "Multifamily / Agency Lender",
  "CMBS / Conduit",
  "Life Company Lender",
  "Church Lender",
  "Farm / Agricultural Lender",
  "Franchise Finance",
  "Equipment / Leasing",
  "Merchant / MCA / CC Financing",
  "Securities / IRA Lender",
  "Auction / Asset Disposition",
  "Restructuring / Turnaround",
  "Consulting / Advisory",
  "Law Firm",
  "Broker / Correspondent",
  "Cost Segregation / Tax Service",
  "Commercial Finance",
] as const;

export function blankLender(): Lender {
  const empty: Partial<Lender> = {};
  for (const f of LENDER_FIELDS) (empty as Record<string, string>)[f] = "";
  return empty as Lender;
}
