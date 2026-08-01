/**
 * Declarative field registry for borrower/guarantor/entity blocks.
 * Consumed by the Stage 2 Forms Engine (internal composer + public portal).
 */

export type DealPartyFieldKind = "text" | "email" | "tel" | "date" | "select";

export type DealPartyFieldTarget =
  | "borrower"
  | "guarantor"
  | "business"
  | "guarantor_pfs";

export type DealPartyFieldDef = {
  /** Stable key for forms engine + CRM mapping (e.g. borrower_first_name). */
  registryKey: string;
  /** Intake sheet property on the row object (or business block). */
  rowKey: string;
  label: string;
  kind: DealPartyFieldKind;
  target: DealPartyFieldTarget;
  colSpan?: 1 | 2 | 3;
  selectOptions?: readonly string[];
  /** When true, portal hides unless borrower party type is entity. */
  entityOnly?: boolean;
  /** When true, portal hides when party type is entity. */
  individualOnly?: boolean;
};

export type DealPartyFieldGroup = {
  id: string;
  label: string;
  description?: string;
  fields: readonly DealPartyFieldDef[];
};

export const BORROWER_IDENTITY_FIELDS: readonly DealPartyFieldDef[] = [
  {
    registryKey: "borrower_first_name",
    rowKey: "firstName",
    label: "First name",
    kind: "text",
    target: "borrower",
    individualOnly: true,
  },
  {
    registryKey: "borrower_middle_name",
    rowKey: "middleName",
    label: "Middle name",
    kind: "text",
    target: "borrower",
    individualOnly: true,
  },
  {
    registryKey: "borrower_last_name",
    rowKey: "lastName",
    label: "Last name",
    kind: "text",
    target: "borrower",
    individualOnly: true,
  },
  {
    registryKey: "borrower_email",
    rowKey: "email",
    label: "Email",
    kind: "email",
    target: "borrower",
    colSpan: 2,
    individualOnly: true,
  },
  {
    registryKey: "borrower_mobile",
    rowKey: "mobile",
    label: "Mobile",
    kind: "tel",
    target: "borrower",
    individualOnly: true,
  },
  {
    registryKey: "borrower_home_phone",
    rowKey: "homePhone",
    label: "Home phone",
    kind: "tel",
    target: "borrower",
    individualOnly: true,
  },
  {
    registryKey: "borrower_alt_phone",
    rowKey: "altPhone",
    label: "Alt phone",
    kind: "tel",
    target: "borrower",
    individualOnly: true,
  },
  {
    registryKey: "borrower_ssn",
    rowKey: "ssn",
    label: "SSN",
    kind: "text",
    target: "borrower",
    individualOnly: true,
  },
  {
    registryKey: "borrower_dob",
    rowKey: "dob",
    label: "DOB",
    kind: "date",
    target: "borrower",
    individualOnly: true,
  },
  {
    registryKey: "borrower_fico",
    rowKey: "fico",
    label: "FICO",
    kind: "text",
    target: "borrower",
    individualOnly: true,
  },
];

export const BORROWER_ENTITY_FIELDS: readonly DealPartyFieldDef[] = [
  {
    registryKey: "entity_legal_name",
    rowKey: "legalName",
    label: "Entity legal name",
    kind: "text",
    target: "business",
    colSpan: 2,
    entityOnly: true,
  },
  {
    registryKey: "entity_ein",
    rowKey: "ein",
    label: "EIN",
    kind: "text",
    target: "business",
    entityOnly: true,
  },
  {
    registryKey: "entity_type",
    rowKey: "entityType",
    label: "Entity type",
    kind: "select",
    target: "business",
    entityOnly: true,
    selectOptions: ["LLC", "S-Corp", "C-Corp", "Partnership", "Sole Proprietorship"],
  },
  {
    registryKey: "entity_dba",
    rowKey: "dba",
    label: "DBA",
    kind: "text",
    target: "business",
    entityOnly: true,
  },
];

export const BORROWER_EMPLOYMENT_FIELDS: readonly DealPartyFieldDef[] = [
  {
    registryKey: "borrower_employer",
    rowKey: "employerName",
    label: "Employer",
    kind: "text",
    target: "borrower",
    colSpan: 2,
    individualOnly: true,
  },
  {
    registryKey: "borrower_position",
    rowKey: "position",
    label: "Position",
    kind: "text",
    target: "borrower",
    individualOnly: true,
  },
  {
    registryKey: "borrower_employer_phone",
    rowKey: "employerPhone",
    label: "Employer phone",
    kind: "tel",
    target: "borrower",
    individualOnly: true,
  },
];

export const GUARANTOR_IDENTITY_FIELDS: readonly DealPartyFieldDef[] = [
  {
    registryKey: "guarantor_name",
    rowKey: "name",
    label: "Full name",
    kind: "text",
    target: "guarantor",
    colSpan: 2,
  },
  {
    registryKey: "guarantor_email",
    rowKey: "email",
    label: "Email",
    kind: "email",
    target: "guarantor",
  },
  {
    registryKey: "guarantor_mobile",
    rowKey: "mobile",
    label: "Mobile",
    kind: "tel",
    target: "guarantor",
  },
  {
    registryKey: "guarantor_ssn",
    rowKey: "ssn",
    label: "SSN",
    kind: "text",
    target: "guarantor",
  },
  {
    registryKey: "guarantor_dob",
    rowKey: "dob",
    label: "DOB",
    kind: "date",
    target: "guarantor",
  },
  {
    registryKey: "guarantor_fico",
    rowKey: "fico",
    label: "FICO",
    kind: "text",
    target: "guarantor",
  },
  {
    registryKey: "guarantor_role",
    rowKey: "role",
    label: "Role",
    kind: "select",
    target: "guarantor",
    selectOptions: ["Primary", "Secondary", "Sponsor", "Key Principal"],
  },
  {
    registryKey: "guarantor_address",
    rowKey: "address",
    label: "Residence address",
    kind: "text",
    target: "guarantor",
    colSpan: 3,
  },
];

/** Personal financial statement — high-level intake keys (expanded in later phases). */
export const GUARANTOR_PFS_FIELDS: readonly DealPartyFieldDef[] = [
  {
    registryKey: "guarantor_pfs_total_assets",
    rowKey: "totalAssets",
    label: "Total assets ($)",
    kind: "text",
    target: "guarantor_pfs",
  },
  {
    registryKey: "guarantor_pfs_total_liabilities",
    rowKey: "totalLiabilities",
    label: "Total liabilities ($)",
    kind: "text",
    target: "guarantor_pfs",
  },
  {
    registryKey: "guarantor_pfs_net_worth",
    rowKey: "netWorth",
    label: "Net worth ($)",
    kind: "text",
    target: "guarantor_pfs",
  },
];

export const DEAL_PARTY_FIELD_GROUPS: readonly DealPartyFieldGroup[] = [
  {
    id: "borrower_core",
    label: "Borrower — Core",
    description: "Primary borrower identity fields.",
    fields: BORROWER_IDENTITY_FIELDS,
  },
  {
    id: "borrower_entity",
    label: "Borrower — Entity",
    description: "Legal entity name, EIN, and structure.",
    fields: BORROWER_ENTITY_FIELDS,
  },
  {
    id: "borrower_employment",
    label: "Borrower — Employment",
    fields: BORROWER_EMPLOYMENT_FIELDS,
  },
  {
    id: "guarantor_core",
    label: "Guarantor — Core",
    fields: GUARANTOR_IDENTITY_FIELDS,
  },
  {
    id: "guarantor_pfs",
    label: "Guarantor — Personal Financial Statement",
    description: "Summary PFS totals (detailed schedule in file workspace).",
    fields: GUARANTOR_PFS_FIELDS,
  },
];

export const ALL_DEAL_PARTY_FIELDS: readonly DealPartyFieldDef[] =
  DEAL_PARTY_FIELD_GROUPS.flatMap((g) => g.fields);

const REGISTRY_KEY_MAP = new Map(
  ALL_DEAL_PARTY_FIELDS.map((f) => [f.registryKey, f] as const),
);

export function dealPartyFieldByRegistryKey(
  key: string,
): DealPartyFieldDef | undefined {
  return REGISTRY_KEY_MAP.get(key);
}

export function isKnownDealPartyRegistryKey(key: string): boolean {
  return REGISTRY_KEY_MAP.has(key);
}

export type DealPartyBlockKind = "borrower" | "guarantor";

export function fieldsForPartyKind(
  kind: DealPartyBlockKind,
): readonly DealPartyFieldDef[] {
  return kind === "borrower" ? BORROWER_IDENTITY_FIELDS : GUARANTOR_IDENTITY_FIELDS;
}

/** Built-in form presets shown in the composer before a custom form is saved. */
export const BUILTIN_INTAKE_FORM_PRESETS = [
  {
    id: "standard_client_intake",
    label: "Standard Client Intake",
    description: "Core borrower identity + contact info for individual borrowers.",
    formType: "file_intake" as const,
    borrowerPartyType: "individual" as const,
    fieldKeys: [
      "borrower_first_name",
      "borrower_last_name",
      "borrower_email",
      "borrower_mobile",
    ],
  },
  {
    id: "entity_borrower_intake",
    label: "Entity Borrower Intake",
    description: "Legal entity name, EIN, and entity type.",
    formType: "file_intake" as const,
    borrowerPartyType: "entity" as const,
    fieldKeys: ["entity_legal_name", "entity_ein", "entity_type"],
  },
  {
    id: "referral_lead_capture",
    label: "Referral Lead Capture",
    description:
      "Creates a new pipeline file tagged as an incoming referral when submitted.",
    formType: "referral" as const,
    borrowerPartyType: "individual" as const,
    fieldKeys: [
      "borrower_first_name",
      "borrower_last_name",
      "borrower_email",
      "borrower_mobile",
    ],
  },
] as const;

export type BorrowerPartyType = "individual" | "entity" | "either";

export function portalFieldsForForm(args: {
  fieldKeys: readonly string[];
  borrowerPartyType: BorrowerPartyType;
  submittedPartyType?: "individual" | "entity";
}): DealPartyFieldDef[] {
  const partyType =
    args.borrowerPartyType === "either"
      ? (args.submittedPartyType ?? "individual")
      : args.borrowerPartyType;

  return args.fieldKeys
    .map((key) => dealPartyFieldByRegistryKey(key))
    .filter((def): def is DealPartyFieldDef => def != null)
    .filter((def) => {
      if (partyType === "entity" && def.individualOnly) return false;
      if (partyType === "individual" && def.entityOnly) return false;
      return true;
    });
}
