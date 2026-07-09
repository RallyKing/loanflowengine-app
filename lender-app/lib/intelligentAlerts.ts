/**
 * Deterministic, in-context alerts (missing data, inconsistencies, risk hints).
 * UI layers render these — no automatic data writes.
 */

export type IntelligentAlertSeverity = "warning" | "info";

export type IntelligentAlert = {
  id: string;
  severity: IntelligentAlertSeverity;
  /** Short headline */
  message: string;
  /** Optional one-line detail */
  detail?: string;
};

const DTI_BACK_WARN = 0.43;
const DTI_BACK_ELEVATED = 0.36;
const DTI_FRONT_FHA = 0.31;

function fundingMismatch(
  a: number,
  b: number,
  relTol: number,
  absTol: number,
): boolean {
  if (!(a > 0 && b > 0)) return false;
  const diff = Math.abs(a - b);
  const base = Math.max(a, b);
  return diff >= absTol && diff / base >= relTol;
}

/** DTI tool (Analysis) — ratio and guideline hints. */
export function buildDtiToolAlerts(args: {
  grossIncome: number;
  frontDti: number;
  backDti: number;
}): IntelligentAlert[] {
  const out: IntelligentAlert[] = [];
  const { grossIncome, frontDti, backDti } = args;

  if (grossIncome <= 0 && (frontDti > 0 || backDti > 0)) {
    out.push({
      id: "dti-no-income",
      severity: "warning",
      message: "Income is missing or zero",
      detail: "DTI ratios need gross monthly income to be meaningful.",
    });
    return out;
  }

  if (backDti >= DTI_BACK_WARN) {
    out.push({
      id: "dti-back-high",
      severity: "warning",
      message: "Back-end DTI exceeds a common 43% cap",
      detail: "Agency / QM files often need compensating factors or a different program.",
    });
  } else if (backDti > DTI_BACK_ELEVATED) {
    out.push({
      id: "dti-back-elevated",
      severity: "info",
      message: "Back-end DTI is elevated",
      detail: "Worth stress-testing reserves, LTV, and documentation early.",
    });
  }

  if (grossIncome > 0 && frontDti > DTI_FRONT_FHA) {
    out.push({
      id: "dti-front-fha",
      severity: "info",
      message: "Housing ratio above classic ~31% FHA housing benchmark",
      detail: "Still fileable if back-end and AUS allow — confirm with your investor.",
    });
  }

  return out;
}

/** Cover vs scenario loan amount when both populated. */
export function buildCoverScenarioFundingAlerts(args: {
  coverFunding: number;
  scenarioProposed: number;
}): IntelligentAlert[] {
  const { coverFunding, scenarioProposed } = args;
  if (
    !fundingMismatch(coverFunding, scenarioProposed, 0.02, 500) &&
    !(coverFunding > 0 && scenarioProposed <= 0) &&
    !(scenarioProposed > 0 && coverFunding <= 0)
  ) {
    return [];
  }
  const out: IntelligentAlert[] = [];

  if (
    coverFunding > 0 &&
    scenarioProposed > 0 &&
    fundingMismatch(coverFunding, scenarioProposed, 0.02, 500)
  ) {
    out.push({
      id: "funding-cover-scenario-mismatch",
      severity: "warning",
      message: "Funding mismatch between coversheet and scenario",
      detail: "Loan summary and scenario proposed amounts differ materially — align before pricing or disclosures.",
    });
  } else if (coverFunding > 0 && scenarioProposed <= 0) {
    out.push({
      id: "funding-scenario-empty",
      severity: "info",
      message: "Scenario proposed amount is empty",
      detail: "Coversheet shows a loan amount but scenario is blank — easy to drift in underwriting.",
    });
  } else if (scenarioProposed > 0 && coverFunding <= 0) {
    out.push({
      id: "funding-cover-empty",
      severity: "info",
      message: "Coversheet funding amount is empty",
      detail: "Scenario has a proposed amount but coversheet funding is blank — table and docs may disagree.",
    });
  }

  return out;
}

/** Required identity fields on the deal workspace. */
export function buildDealIdentityAlerts(args: {
  clientName: string;
  projectName: string;
}): IntelligentAlert[] {
  const out: IntelligentAlert[] = [];
  const c = args.clientName.trim();
  const p = args.projectName.trim();
  if (!c) {
    out.push({
      id: "missing-client",
      severity: "warning",
      message: "Client name is required",
      detail: "Add it in the deal workspace header before exporting or sharing.",
    });
  }
  if (!p) {
    out.push({
      id: "missing-project",
      severity: "warning",
      message: "Project name is required",
      detail: "Helps keep files searchable and disclosures consistent.",
    });
  }
  return out;
}

/** Contacts drawer: no CRM links and no legacy rows. */
export function buildContactFileAlerts(args: {
  legacyContactCount: number;
  linkedContactCount: number;
}): IntelligentAlert[] {
  if (args.legacyContactCount > 0 || args.linkedContactCount > 0) {
    return [];
  }
  return [
    {
      id: "contacts-missing",
      severity: "info",
      message: "No contacts on this file",
      detail: "Link a borrower or partner contact so outreach and compliance trails are clear.",
    },
  ];
}

/**
 * Pipeline row mirror vs deal-resolved table funding (deal-backed files only).
 */
export function buildPipelineFundingMirrorAlerts(args: {
  dealBacked: boolean;
  pipelineFunding: number;
  resolvedFromDeal: number;
}): IntelligentAlert[] {
  if (!args.dealBacked) return [];
  const { pipelineFunding, resolvedFromDeal } = args;
  if (!(pipelineFunding > 0 && resolvedFromDeal > 0)) return [];
  if (!fundingMismatch(pipelineFunding, resolvedFromDeal, 0.03, 1000)) {
    return [];
  }
  return [
    {
      id: "pipeline-funding-drift",
      severity: "info",
      message: "Funding mismatch: file row vs deal workspace",
      detail: "The amount on the pipeline row differs from the deal-derived amount. Save or refresh after editing the deal.",
    },
  ];
}

/** Scenario tab: leverage + purpose combinations. */
export function buildScenarioRiskAlerts(args: {
  loanPurpose: string;
  cltv: number;
  creditScoreText: string;
}): IntelligentAlert[] {
  const out: IntelligentAlert[] = [];
  const purpose = args.loanPurpose.toLowerCase();
  const fico = parseInt(String(args.creditScoreText).replace(/\D/g, ""), 10);

  if (purpose.includes("cash") && args.cltv > 0.8) {
    out.push({
      id: "scenario-cashout-high-cltv",
      severity: "warning",
      message: "High CLTV on a cash-out structure",
      detail: "Investors often cap LTV by FICO tier — confirm eligibility before quoting.",
    });
  }

  if (args.cltv > 0.95) {
    out.push({
      id: "scenario-cltv-very-high",
      severity: "warning",
      message: "CLTV is very high",
      detail: "Pricing, MI, and reserve rules tighten — double-check program limits.",
    });
  }

  if (
    purpose.includes("purchase") &&
    Number.isFinite(fico) &&
    fico > 0 &&
    fico < 620
  ) {
    out.push({
      id: "scenario-fico-low-purchase",
      severity: "info",
      message: "FICO looks below typical conventional purchase floors",
      detail: "Non-QM or government programs may still fit — set expectations with the borrower.",
    });
  }

  return out;
}
