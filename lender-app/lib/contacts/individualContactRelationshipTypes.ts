export const COMMON_INDIVIDUAL_RELATIONSHIP_TYPES = [
  "Spouse",
  "Business Partner",
  "Referral Source",
  "Co-borrower",
  "Family Member",
  "Attorney",
  "Accountant",
  "Other",
] as const;

export type CommonIndividualRelationshipType =
  (typeof COMMON_INDIVIDUAL_RELATIONSHIP_TYPES)[number];
