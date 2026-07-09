/**
 * Suggested values for the deal **`fundingType`** field (File → Overview).
 * Users may still enter any custom string; the pipeline table shows exactly
 * what is stored on `fundingType`. Order is intentionally not residential-first
 * so the datalist does not read like a default.
 */
export const FUNDING_TYPE_SUGGESTIONS = [
  "Commercial / DSCR",
  "Business funding",
  "Hard money / bridge",
  "Fix & flip",
  "Ground-up construction",
  "Line of credit",
  "SBA",
  "Equipment financing",
  "Residential mortgage",
] as const;
