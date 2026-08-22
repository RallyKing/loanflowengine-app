"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import { BlockPdfExportButton } from "@/components/library/BlockPdfExportButton";
import { ReoContactMultiAssign } from "@/components/intake/reo/ReoContactMultiAssign";
import { ReoZillowUrlControl } from "@/components/intake/reo/ReoZillowUrlControl";
import { ScheduleCopyToFileDialog } from "@/components/schedule/ScheduleCopyToFileDialog";
import { IntelligentAlertsCallout } from "@/components/IntelligentAlertsCallout";
import {
  buildCoverScenarioFundingAlerts,
  buildDtiToolAlerts,
  buildScenarioRiskAlerts,
} from "@/lib/intelligentAlerts";
import type {
  DealSectionProps,
  DealWorkspaceSheet,
} from "@/lib/file/dealSectionTypes";
import { useDealWorkspaceEditorOptional } from "@/lib/file/useDealWorkspaceEditor";
import {
  buildBlockPdfVaultFileName,
  buildBusinessDebtBlockPdfSpec,
  buildReoBlockPdfSpec,
  resolveBlockPdfVaultFolder,
  saveBlockFillablePdfToVault,
} from "@/lib/blockPdfExport";
import {
  BUSINESS_DEBT_TYPE_OPTIONS,
  computeBusinessDebtScheduleTotals,
  createEmptyBusinessDebtRow,
  formatBusinessDebtUsd,
  isBusinessDebtType,
  ensureDealBusinessDebtRowId,
  sanitizeDealBusinessDebtRow,
  sanitizeDealBusinessDebtRows,
  type DealBusinessDebtRow,
} from "@/lib/businessDebt/scheduleOfBusinessDebtModel";
import type { VaultUploadMutations } from "@/lib/library/uploadFileToVault";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import {
  REO_POSITION_OPTIONS,
  REO_PROPERTY_TYPE_OPTIONS,
  REO_USAGE_OPTIONS,
  computeReoRow,
  computeReoScheduleTotals,
  createEmptyReoRow,
  formatReoLtv,
  formatReoUsd,
  normalizeContactIdList,
  ensureDealReoRowId,
  sanitizeDealReoRow,
  sanitizeDealReoRows,
  withComputedReoFields,
  type DealReoRow,
} from "@/lib/reo/scheduleOfReoModel";
import { toHtmlDateInputValue } from "@/lib/schedule/dateInput";

type Sheet = DealWorkspaceSheet;
import {
  buildAmortization,
  daysBetween,
  formatPct,
  formatUSD,
  monthlyPayment,
  parseRate,
  toNumber,
} from "@/lib/intake/finance";
import { computeComparisonLoanSideMetrics } from "@/lib/intake/comparisonLoanSide";
import { computeDtiMetrics } from "@/lib/intake/dtiCompute";
import { deriveIntake } from "@/lib/intake/derivations";
import { useNarrowViewport } from "@/lib/useNarrowViewport";
import { cn } from "@/lib/cn";
import { sumLiabilitiesMonthlyPayments } from "@/lib/intake/moneyAggregates";
import {
  computeWeightedAverageRateByBalance,
  sumWeightedInterestMonthlyPayments,
} from "@/lib/intake/weightedInterestBlend";
import {
  normalizeComparisonInstances,
  normalizeDayCounterInstances,
  normalizeDtiInstances,
  normalizePayoffInstances,
  normalizeWeightedInstances,
  type ComparisonData,
  type DayCounterData,
  type PayoffData,
  type WeightedData,
} from "@/lib/intake/analysisInstances";
import { MultiInstanceToolShell } from "./analysis/MultiInstanceToolShell";
import { DealBlockAiAssistPanel } from "./DealBlockAiAssistPanel";
import { Button, Field, LinkedField, SectionCard, Select, TextArea, TextInput } from "./ui/Field";
import {
  mergeCoverFromSanitizedPatch,
  mergeDtiFromSanitizedPatch,
  mergeScenarioFromSanitizedPatch,
} from "@/lib/dealBlockAiAssistApply";

export type SectionProps = DealSectionProps;

function scenarioSnapshotTextValue(v: unknown): string {
  const s = String(v ?? "").trim();
  return s ? s : "N/A";
}

function scenarioSnapshotCurrencyValue(v: unknown): string {
  const raw = String(v ?? "").trim();
  if (!raw) return "N/A";
  const n = toNumber(raw);
  if (!Number.isFinite(n)) return "N/A";
  return formatUSD(n);
}

function scenarioSnapshotPercentValue(v: number): string {
  if (!Number.isFinite(v)) return "N/A";
  return `${(v * 100).toFixed(2)}%`;
}

function buildScenarioSnapshotExportText(input: {
  loanPurpose?: string;
  fundingType?: string;
  age?: string;
  propertyType?: string;
  propertyOwnership?: string;
  creditScore?: string;
  propertyAddress?: string;
  propertyValue?: string;
  currentLoan1?: string;
  currentLoan2?: string;
  proposedFundingAmount?: string;
  loanTermYears?: string;
  cashOutAmount?: string;
  cltv: number | null;
  bkForeclosureLate?: string;
}): string {
  return [
    "Scenario Snapshot",
    "A printable one-page summary of the deal.",
    "",
    `* Loan Purpose: ${scenarioSnapshotTextValue(input.loanPurpose)}`,
    `* Funding Type: ${scenarioSnapshotTextValue(input.fundingType)}`,
    `* Age: ${scenarioSnapshotTextValue(input.age)}`,
    `* Property Type: ${scenarioSnapshotTextValue(input.propertyType)}`,
    `* Property Ownership: ${scenarioSnapshotTextValue(input.propertyOwnership)}`,
    `* Credit Score: ${scenarioSnapshotTextValue(input.creditScore)}`,
    `* Property Address: ${scenarioSnapshotTextValue(input.propertyAddress)}`,
    `* Property Value: ${scenarioSnapshotCurrencyValue(input.propertyValue)}`,
    `* Current 1st Loan: ${scenarioSnapshotCurrencyValue(input.currentLoan1)}`,
    `* Current 2nd Loan: ${scenarioSnapshotCurrencyValue(input.currentLoan2)}`,
    `* Proposed Funding Amount: ${scenarioSnapshotCurrencyValue(input.proposedFundingAmount)}`,
    `* Loan Term: ${input.loanTermYears?.trim() ? `${input.loanTermYears.trim()} years` : "N/A"}`,
    `* Cash-Out Amount: ${scenarioSnapshotCurrencyValue(input.cashOutAmount)}`,
    `* CLTV: ${
      input.cltv == null ? "N/A" : scenarioSnapshotPercentValue(input.cltv)
    }`,
    `* BK / Foreclosure / Late: ${scenarioSnapshotTextValue(
      input.bkForeclosureLate
    )}`,
  ].join("\n");
}

function downloadScenarioSnapshotTextFile(text: string): void {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scenario-snapshot-${ts}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ================================== Cover ================================== */

export function CoverSection({ draft, update }: SectionProps) {
  const cover = draft.cover ?? {};
  const lenders = cover.lenders ?? [];
  const d = deriveIntake(draft);

  function set<K extends keyof typeof cover>(k: K, v: (typeof cover)[K]) {
    update("cover", { ...cover, [k]: v });
  }
  function setLender(i: number, patch: Partial<(typeof lenders)[number]>) {
    const next = lenders.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    set("lenders", next);
  }

  const purchasePrice = toNumber(cover.purchasePrice) || toNumber(d.subjectValue);
  const fundingAmount =
    toNumber(cover.fundingAmount) || toNumber(d.proposedLoanAmount);
  const ltv = purchasePrice > 0 ? fundingAmount / purchasePrice : 0;
  const firstLoanRate = d.firstLoan?.currentRate ?? "";

  const grossComp = parseRate(cover.grossCompPct);
  const brokerComp = parseRate(cover.brokerCompPct);
  const flat = toNumber(cover.flatFee);
  const comp = fundingAmount * (grossComp + brokerComp);
  const totalComp = comp + flat;

  const coverFundingAlerts = useMemo(
    () =>
      buildCoverScenarioFundingAlerts({
        coverFunding: toNumber(cover.fundingAmount),
        scenarioProposed: toNumber(draft.scenario?.proposedLoanAmount),
      }),
    [cover.fundingAmount, draft.scenario?.proposedLoanAmount],
  );

  return (
    <div className="flex flex-col gap-5">
      {coverFundingAlerts.length > 0 ? (
        <IntelligentAlertsCallout alerts={coverFundingAlerts} maxVisible={2} />
      ) : null}
      <DealBlockAiAssistPanel
        blockKind="funding"
        fingerprint={[
          draft.dealType ?? "",
          cover.fundingType ?? "",
          cover.purpose ?? "",
          String(ltv),
          String(fundingAmount),
        ].join("|")}
        buildContext={() => ({
          dealType: draft.dealType ?? "",
          coverFundingType: cover.fundingType ?? "",
          ltv,
          fundingAmount,
          purpose: cover.purpose ?? "",
          prepayStructure: cover.prepayStructure ?? "",
        })}
        onApply={(s) => {
          if (!s.patch) return;
          const merged = mergeCoverFromSanitizedPatch(cover, s.patch);
          update("cover", merged);
        }}
      />
      <SectionCard title="Loan completion coversheet" description="High-level file summary at a glance.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Deal type"
            hint="Coversheet category only. Set Funding type in File → Overview for the pipeline table."
          >
            <Select
              data-pipeline-deal-path="dealType"
              value={draft.dealType ?? ""}
              onChange={(e) => update("dealType", e.target.value)}
            >
              <option value="">—</option>
              <option>Residential Mortgage</option>
              <option>Commercial / DSCR</option>
              <option>Hard Money / Bridge</option>
              <option>Fix & Flip</option>
              <option>Ground-Up Construction</option>
              <option>Business Funding</option>
              <option>SBA</option>
              <option>Equipment Financing</option>
            </Select>
          </Field>
          <Field label="Loan officer">
            <TextInput value={cover.loanOfficer ?? ""} onChange={(e) => set("loanOfficer", e.target.value)} />
          </Field>
          <Field label="Broker / Company">
            <TextInput value={cover.brokerCompanyName ?? ""} onChange={(e) => set("brokerCompanyName", e.target.value)} />
          </Field>
          <Field label="Broker agreement date">
            <TextInput type="date" value={cover.brokerAgreementDate ?? ""} onChange={(e) => set("brokerAgreementDate", e.target.value)} />
          </Field>
          <Field label="Submission date">
            <TextInput type="date" value={cover.subDate ?? ""} onChange={(e) => set("subDate", e.target.value)} />
          </Field>
          <Field label="Est. COE / fund">
            <TextInput type="date" value={cover.estCOE ?? ""} onChange={(e) => set("estCOE", e.target.value)} />
          </Field>
          <Field label="Recourse">
            <Select value={cover.recourse ?? ""} onChange={(e) => set("recourse", e.target.value)}>
              <option value="">—</option>
              <option>Full Recourse</option>
              <option>Limited Recourse</option>
              <option>Non-Recourse</option>
              <option>Non-Recourse w/ Carve-Outs</option>
            </Select>
          </Field>
          <Field label="Prepay structure">
            <Select value={cover.prepayStructure ?? ""} onChange={(e) => set("prepayStructure", e.target.value)}>
              <option value="">—</option>
              <option>None</option>
              <option>Step-Down (5/4/3/2/1)</option>
              <option>Step-Down (3/2/1)</option>
              <option>Yield Maintenance</option>
              <option>Defeasance</option>
              <option>Min. interest period</option>
            </Select>
          </Field>
          <LinkedField
            label="Borrower(s)"
            className="sm:col-span-3"
            value={cover.borrowers ?? ""}
            linkedValue={d.borrowersJoined}
            linkedFrom="Intake: Borrowers"
            onChange={(v) => set("borrowers", v)}
          />
          <LinkedField
            label="Primary phone"
            value={cover.primaryPhone ?? ""}
            linkedValue={d.borrowerPhone}
            linkedFrom="Intake: Borrowers"
            onChange={(v) => set("primaryPhone", v)}
          />
          <LinkedField
            label="Email"
            className="sm:col-span-2"
            value={cover.email ?? ""}
            linkedValue={d.borrowerEmail}
            linkedFrom="Intake: Borrowers"
            onChange={(v) => set("email", v)}
            type="email"
          />
          <LinkedField
            label="Subject property"
            className="sm:col-span-3"
            value={cover.subjectProperty ?? ""}
            linkedValue={d.subjectAddress}
            linkedFrom="Intake: Property"
            onChange={(v) => set("subjectProperty", v)}
          />
          <LinkedField
            label="Purchase / appraised value ($)"
            value={cover.purchasePrice ?? ""}
            linkedValue={d.subjectValue}
            linkedFrom="Intake: Property"
            onChange={(v) => set("purchasePrice", v)}
          />
          <LinkedField
            label="Funding amount ($)"
            data-testid="deal-cover-funding-input"
            value={cover.fundingAmount ?? ""}
            linkedValue={d.proposedLoanAmount}
            linkedFrom="Scenario"
            onChange={(v) => set("fundingAmount", v)}
          />
          <ReadStat label="LTV" value={purchasePrice > 0 ? formatPct(ltv, 2) : "—"} />
        </div>
      </SectionCard>

      <SectionCard title="Loan summary">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Occupancy">
            <Select value={cover.occupancy ?? ""} onChange={(e) => set("occupancy", e.target.value)}>
              <option value="">—</option>
              <option>Primary</option>
              <option>2nd Home</option>
              <option>Investment</option>
            </Select>
          </Field>
          <Field label="Payment type">
            <Select value={cover.paymentType ?? ""} onChange={(e) => set("paymentType", e.target.value)}>
              <option value="">—</option>
              <option>P&I</option>
              <option>Interest Only</option>
              <option>ARM</option>
            </Select>
          </Field>
          <Field label="Purpose of loan">
            <Select
              data-pipeline-deal-path="cover.purpose"
              value={cover.purpose ?? ""}
              onChange={(e) => set("purpose", e.target.value)}
            >
              <option value="">—</option>
              <option>Purchase</option>
              <option>Rate / Term</option>
              <option>Cash-Out</option>
            </Select>
          </Field>
          <Field label="Funding type">
            <Select
              data-pipeline-deal-path="cover.fundingType"
              value={cover.fundingType ?? ""}
              onChange={(e) => set("fundingType", e.target.value)}
            >
              <option value="">—</option>
              <option>Conventional</option>
              <option>FHA</option>
              <option>VA</option>
              <option>USDA</option>
              <option>Non-QM</option>
              <option>Jumbo</option>
            </Select>
          </Field>
          <Field label="Property type">
            <Select value={cover.propertyType ?? ""} onChange={(e) => set("propertyType", e.target.value)}>
              <option value="">—</option>
              <option>SFR</option>
              <option>Condo</option>
              <option>Townhome</option>
              <option>2-4 Unit</option>
              <option>Manufactured</option>
              <option>Commercial</option>
            </Select>
          </Field>
          <Field label="Escrow waiver">
            <Select value={cover.escrowWaiver ?? ""} onChange={(e) => set("escrowWaiver", e.target.value)}>
              <option value="">—</option>
              <option>No</option>
              <option>Yes</option>
            </Select>
          </Field>
          <Field label="Prepay penalty">
            <Select value={cover.prepayPenalty ?? ""} onChange={(e) => set("prepayPenalty", e.target.value)}>
              <option value="">—</option>
              <option>No</option>
              <option>Yes</option>
            </Select>
          </Field>
          <Field label="Current lender">
            <TextInput value={cover.currentLender ?? ""} onChange={(e) => set("currentLender", e.target.value)} />
          </Field>
          <Field label="Program">
            <TextInput
              data-pipeline-deal-path="cover.program"
              value={cover.program ?? ""}
              onChange={(e) => set("program", e.target.value)}
            />
          </Field>
          <LinkedField
            label="Rate (%)"
            value={cover.ratePct ?? ""}
            linkedValue={firstLoanRate}
            linkedFrom="Intake: Loans"
            onChange={(v) => set("ratePct", v)}
          />
          <Field label="FHA case #">
            <TextInput value={cover.fhaCase ?? ""} onChange={(e) => set("fhaCase", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Compensation"
        actions={
          <span className="text-sm text-muted-foreground">
            Total: <strong>{formatUSD(totalComp)}</strong>
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Gross comp (%)">
            <TextInput value={cover.grossCompPct ?? ""} onChange={(e) => set("grossCompPct", e.target.value)} />
          </Field>
          <Field label="Broker comp (%)">
            <TextInput value={cover.brokerCompPct ?? ""} onChange={(e) => set("brokerCompPct", e.target.value)} />
          </Field>
          <Field label="Flat fee ($)">
            <TextInput value={cover.flatFee ?? ""} onChange={(e) => set("flatFee", e.target.value)} />
          </Field>
          <Field label="Compensation type">
            <Select value={cover.compType ?? ""} onChange={(e) => set("compType", e.target.value)}>
              <option value="">—</option>
              <option>Borrower Paid</option>
              <option>Lender Paid</option>
            </Select>
          </Field>
          <Field label="Lender comp plan" className="sm:col-span-2">
            <TextInput value={cover.lenderCompPlan ?? ""} onChange={(e) => set("lenderCompPlan", e.target.value)} />
          </Field>
          <ReadStat label="Comp $" value={formatUSD(comp)} />
          <ReadStat label="Total $" value={formatUSD(totalComp)} />
        </div>
      </SectionCard>

      <SectionCard
        title="Lock dates"
        description="Track rate locks and expiration windows."
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Lock date">
            <TextInput type="date" value={cover.lockDate1 ?? ""} onChange={(e) => set("lockDate1", e.target.value)} />
          </Field>
          <Field label="Expiration">
            <TextInput type="date" value={cover.lockExpires1 ?? ""} onChange={(e) => set("lockExpires1", e.target.value)} />
          </Field>
          <Field label="2nd lock date">
            <TextInput type="date" value={cover.lockDate2 ?? ""} onChange={(e) => set("lockDate2", e.target.value)} />
          </Field>
          <Field label="2nd expiration">
            <TextInput type="date" value={cover.lockExpires2 ?? ""} onChange={(e) => set("lockExpires2", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Loan status"
        description="Date each milestone across up to 3 lender submissions."
        actions={
          <Button variant="secondary" onClick={() => set("lenders", [...lenders, { name: `Lender ${lenders.length + 1}` }])}>
            + Lender
          </Button>
        }
      >
        <div className="max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3">Lender</th>
                <th className="px-3">Submission</th>
                <th className="px-3">Approval</th>
                <th className="px-3">Appraisal</th>
                <th className="px-3">CTC</th>
                <th className="px-3">Docs out</th>
                <th className="px-3">Funded</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lenders.map((l, i) => (
                <tr key={i} className="bg-muted/50">
                  <td className="rounded-l-lg px-2">
                    <TextInput value={l.name ?? ""} onChange={(e) => setLender(i, { name: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput type="date" value={l.submission ?? ""} onChange={(e) => setLender(i, { submission: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput type="date" value={l.approval ?? ""} onChange={(e) => setLender(i, { approval: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput type="date" value={l.appraisal ?? ""} onChange={(e) => setLender(i, { appraisal: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput type="date" value={l.ctc ?? ""} onChange={(e) => setLender(i, { ctc: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput type="date" value={l.docsOut ?? ""} onChange={(e) => setLender(i, { docsOut: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput type="date" value={l.funded ?? ""} onChange={(e) => setLender(i, { funded: e.target.value })} />
                  </td>
                  <td className="rounded-r-lg px-2 text-right">
                    <Button variant="ghost" onClick={() => set("lenders", lenders.filter((_, idx) => idx !== i))}>×</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Notes on file">
        <div className="grid gap-4">
          <Field label="Borrower goals">
            <TextArea value={cover.borrowerGoals ?? ""} onChange={(e) => set("borrowerGoals", e.target.value)} />
          </Field>
          <Field label="Notes">
            <TextArea value={cover.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

/* ================================ Scenario ================================ */

export function ScenarioSection({ draft, update }: SectionProps) {
  const narrow = useNarrowViewport();
  const [scenarioMobileStep, setScenarioMobileStep] = useState(0);
  const s = draft.scenario ?? {};
  const debts = s.debts ?? [];
  const counts = s.propertyCounts ?? {};
  const di = deriveIntake(draft);

  function set<K extends keyof typeof s>(k: K, v: (typeof s)[K]) {
    update("scenario", { ...s, [k]: v });
  }
  function setDebt(i: number, patch: Partial<(typeof debts)[number]>) {
    set("debts", debts.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function setCount<K extends keyof typeof counts>(k: K, v: (typeof counts)[K]) {
    set("propertyCounts", { ...counts, [k]: v });
  }

  const propertyValue = toNumber(s.propertyValue) || toNumber(di.subjectValue);
  const proposed = toNumber(s.proposedLoanAmount);
  const cltv = propertyValue > 0 ? proposed / propertyValue : 0;
  const oldPI = toNumber(s.oldPI) || toNumber(di.oldPI);
  const newPI = toNumber(s.newPI);
  const oldPITIA = toNumber(s.oldPITIA) || toNumber(di.oldPITIA);
  const newPITIA = toNumber(s.newPITIA);
  const monthlySavings = (oldPITIA || oldPI) - (newPITIA || newPI);
  const yearlySavings = monthlySavings * 12;
  const income =
    (toNumber(s.income1) || toNumber(di.income1)) +
    (toNumber(s.income2) || toNumber(di.income2));
  const occupancyLinked = draft.occupancy ?? "";
  const propertyAddress = s.propertyAddress ?? di.subjectAddress ?? "";
  const propertyValueRaw = s.propertyValue ?? di.subjectValue ?? "";
  const currentLoan1Raw = s.currentLoan1 ?? di.firstLoanBalance ?? "";
  const currentLoan2Raw = s.currentLoan2 ?? di.secondLoanBalance ?? "";
  const cltvForExport = propertyValue > 0 ? cltv : null;

  const scenarioRiskAlerts = useMemo(
    () =>
      buildScenarioRiskAlerts({
        loanPurpose: s.loanPurpose ?? "",
        cltv,
        creditScoreText: s.creditScore ?? "",
      }),
    [s.loanPurpose, cltv, s.creditScore],
  );

  function exportScenarioSnapshot() {
    const text = buildScenarioSnapshotExportText({
      loanPurpose: s.loanPurpose ?? "",
      fundingType: s.fundingType ?? "",
      age: s.age ?? "",
      propertyType: s.propertyType ?? "",
      propertyOwnership: s.propertyOwnership ?? occupancyLinked ?? "",
      creditScore: s.creditScore ?? "",
      propertyAddress,
      propertyValue: propertyValueRaw,
      currentLoan1: currentLoan1Raw,
      currentLoan2: currentLoan2Raw,
      proposedFundingAmount: s.proposedLoanAmount ?? "",
      loanTermYears: s.loanTermYears ?? "",
      cashOutAmount: s.cashOutAmount ?? "",
      cltv: cltvForExport,
      bkForeclosureLate: s.bkForeclosureLate ?? "",
    });
    downloadScenarioSnapshotTextFile(text);
  }

  return (
    <div className="flex flex-col gap-5">
      {scenarioRiskAlerts.length > 0 ? (
        <IntelligentAlertsCallout alerts={scenarioRiskAlerts} maxVisible={2} />
      ) : null}
      <DealBlockAiAssistPanel
        blockKind="scenario"
        fingerprint={[
          s.loanPurpose ?? "",
          s.fundingType ?? "",
          String(cltv),
          String(income),
          s.proposedLoanAmount ?? "",
        ].join("|")}
        buildContext={() => ({
          loanPurpose: s.loanPurpose ?? "",
          fundingType: s.fundingType ?? "",
          cltv,
          income,
          proposedLoanAmount: s.proposedLoanAmount ?? "",
          creditScore: s.creditScore ?? "",
        })}
        onApply={(s) => {
          if (!s.patch) return;
          const cur = draft.scenario ?? {};
          const merged = mergeScenarioFromSanitizedPatch(cur, s.patch);
          update("scenario", merged);
        }}
      />
      {narrow ? (
        <div className="flex flex-col gap-2 md:hidden">
          <div
            className="flex rounded-xl border border-border/70 bg-muted/30 p-1"
            role="tablist"
            aria-label="Scenario editing steps"
          >
            {(
              ["Setup", "Cashflow", "Debts"] as const
            ).map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={scenarioMobileStep === i}
                className={cn(
                  "min-h-[44px] flex-1 rounded-lg px-1.5 text-center text-[11px] font-semibold leading-tight transition-colors",
                  scenarioMobileStep === i
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                onClick={() => setScenarioMobileStep(i)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div
        className={cn(narrow && scenarioMobileStep !== 0 && "hidden")}
      >
      <SectionCard
        title="Scenario snapshot"
        description="A printable one-page summary of the deal."
        actions={
          <Button variant="secondary" onClick={exportScenarioSnapshot}>
            Export Scenario
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Loan purpose">
            <Select value={s.loanPurpose ?? ""} onChange={(e) => set("loanPurpose", e.target.value)}>
              <option value="">—</option>
              <option>Purchase</option>
              <option>Rate / Term</option>
              <option>Cash-Out</option>
            </Select>
          </Field>
          <Field label="Funding type">
            <Select value={s.fundingType ?? ""} onChange={(e) => set("fundingType", e.target.value)}>
              <option value="">—</option>
              <option>Conventional</option>
              <option>FHA</option>
              <option>VA</option>
              <option>USDA</option>
              <option>Non-QM</option>
              <option>Jumbo</option>
              <option>DSCR</option>
              <option>Bank Statement</option>
              <option>Hard Money / Bridge</option>
              <option>Fix & Flip</option>
              <option>Construction</option>
              <option>Commercial (CRE)</option>
              <option>SBA 7(a)</option>
              <option>SBA 504</option>
              <option>Business Term Loan</option>
              <option>MCA</option>
              <option>Line of Credit</option>
              <option>Equipment Financing</option>
            </Select>
          </Field>
          <Field label="Age">
            <TextInput value={s.age ?? ""} onChange={(e) => set("age", e.target.value)} />
          </Field>
          <Field label="Property type">
            <TextInput value={s.propertyType ?? ""} onChange={(e) => set("propertyType", e.target.value)} />
          </Field>
          <LinkedField
            label="Property ownership"
            value={s.propertyOwnership ?? ""}
            linkedValue={occupancyLinked}
            linkedFrom="Intake: Property"
            onChange={(v) => set("propertyOwnership", v)}
          />
          <Field label="Credit score (approx)">
            <TextInput value={s.creditScore ?? ""} onChange={(e) => set("creditScore", e.target.value)} />
          </Field>
          <LinkedField
            label="Property address"
            className="sm:col-span-3"
            value={s.propertyAddress ?? ""}
            linkedValue={propertyAddress}
            linkedFrom="Intake: Property"
            onChange={(v) => set("propertyAddress", v)}
          />
          <LinkedField
            label="Property value ($)"
            value={s.propertyValue ?? ""}
            linkedValue={propertyValueRaw}
            linkedFrom="Intake: Property"
            onChange={(v) => set("propertyValue", v)}
          />
          <LinkedField
            label="Current 1st loan ($)"
            value={s.currentLoan1 ?? ""}
            linkedValue={currentLoan1Raw}
            linkedFrom="Intake: Loans"
            onChange={(v) => set("currentLoan1", v)}
          />
          <LinkedField
            label="Current 2nd loan ($)"
            value={s.currentLoan2 ?? ""}
            linkedValue={currentLoan2Raw}
            linkedFrom="Intake: Loans"
            onChange={(v) => set("currentLoan2", v)}
          />
          <Field label="Proposed funding amount ($)">
            <TextInput value={s.proposedLoanAmount ?? ""} onChange={(e) => set("proposedLoanAmount", e.target.value)} />
          </Field>
          <Field label="Loan term (years)">
            <TextInput value={s.loanTermYears ?? ""} onChange={(e) => set("loanTermYears", e.target.value)} />
          </Field>
          <Field label="Cash-out amount ($)">
            <TextInput value={s.cashOutAmount ?? ""} onChange={(e) => set("cashOutAmount", e.target.value)} />
          </Field>
          <ReadStat label="CLTV" value={propertyValue > 0 ? formatPct(cltv, 2) : "—"} />
          <Field label="BK / foreclosure / late">
            <Select value={s.bkForeclosureLate ?? ""} onChange={(e) => set("bkForeclosureLate", e.target.value)}>
              <option value="">—</option>
              <option>No</option>
              <option>Yes</option>
            </Select>
          </Field>
        </div>
      </SectionCard>
      </div>

      <div className={cn(narrow && scenarioMobileStep !== 1 && "hidden")}>
      <SectionCard title="Income & housing">
        <div className="grid gap-4 sm:grid-cols-3">
          <LinkedField
            label="Income 1 (monthly $)"
            value={s.income1 ?? ""}
            linkedValue={di.income1}
            linkedFrom="Intake: Income"
            onChange={(v) => set("income1", v)}
          />
          <LinkedField
            label="Income 2 (monthly $)"
            value={s.income2 ?? ""}
            linkedValue={di.income2}
            linkedFrom="Intake: Income"
            onChange={(v) => set("income2", v)}
          />
          <ReadStat label="Total income / mo" value={formatUSD(income)} />
          <LinkedField
            label="Property taxes / mo ($)"
            value={s.propertyTaxesMonthly ?? ""}
            linkedValue={di.loansTaxes}
            linkedFrom="Intake: Loans"
            onChange={(v) => set("propertyTaxesMonthly", v)}
          />
          <LinkedField
            label="Homeowners ins / mo ($)"
            value={s.homeownersInsuranceMonthly ?? ""}
            linkedValue={di.loansInsurance}
            linkedFrom="Intake: Loans"
            onChange={(v) => set("homeownersInsuranceMonthly", v)}
          />
          <LinkedField
            label="HOA / mo ($)"
            value={s.hoaMonthly ?? ""}
            linkedValue={di.loansHoa}
            linkedFrom="Intake: Loans"
            onChange={(v) => set("hoaMonthly", v)}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Savings comparison"
        actions={
          <span className="text-sm text-muted-foreground">
            Monthly: <strong>{formatUSD(monthlySavings)}</strong> · Yearly: <strong>{formatUSD(yearlySavings)}</strong>
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <LinkedField
            label="Old P&I ($)"
            value={s.oldPI ?? ""}
            linkedValue={di.oldPI}
            linkedFrom="Intake: Loans"
            onChange={(v) => set("oldPI", v)}
          />
          <LinkedField
            label="Old PITIA ($)"
            value={s.oldPITIA ?? ""}
            linkedValue={di.oldPITIA}
            linkedFrom="Intake: Loans"
            onChange={(v) => set("oldPITIA", v)}
          />
          <Field label="New P&I ($)">
            <TextInput value={s.newPI ?? ""} onChange={(e) => set("newPI", e.target.value)} />
          </Field>
          <Field label="New PITIA ($)">
            <TextInput value={s.newPITIA ?? ""} onChange={(e) => set("newPITIA", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      </div>

      <div className={cn(narrow && scenarioMobileStep !== 2 && "hidden")}>
      <SectionCard
        title="Recurring monthly debts"
        actions={
          <Button variant="secondary" onClick={() => set("debts", [...debts, { label: `Debt ${debts.length + 1}` }])}>
            + Debt
          </Button>
        }
      >
        <div className="grid gap-3">
          {debts.map((d, i) => (
            <div key={i} className="grid grid-cols-[1fr_160px_40px] items-center gap-3">
              <TextInput value={d.label ?? ""} onChange={(e) => setDebt(i, { label: e.target.value })} placeholder="Debt" />
              <TextInput value={d.amount ?? ""} onChange={(e) => setDebt(i, { amount: e.target.value })} placeholder="$/mo" />
              <Button variant="ghost" onClick={() => set("debts", debts.filter((_, idx) => idx !== i))}>×</Button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="All properties owned"
        description={`Schedule of REO has ${di.reoCounts.total} property${di.reoCounts.total === 1 ? "" : "ies"} on file.`}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <LinkedField
            label="Primary residences"
            value={counts.primary ?? ""}
            linkedValue={di.reoCounts.primary > 0 ? String(di.reoCounts.primary) : ""}
            linkedFrom="Schedule of REO"
            onChange={(v) => setCount("primary", v)}
          />
          <LinkedField
            label="Commercial"
            value={counts.commercial ?? ""}
            linkedValue={di.reoCounts.commercial > 0 ? String(di.reoCounts.commercial) : ""}
            linkedFrom="Schedule of REO"
            onChange={(v) => setCount("commercial", v)}
          />
          <LinkedField
            label="Rental"
            value={counts.rental ?? ""}
            linkedValue={di.reoCounts.rental > 0 ? String(di.reoCounts.rental) : ""}
            linkedFrom="Schedule of REO"
            onChange={(v) => setCount("rental", v)}
          />
        </div>
      </SectionCard>

      <SectionCard title="Scenario notes">
        <TextArea value={s.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </SectionCard>
      </div>
    </div>
  );
}

/* =================================== DTI =================================== */

function DtiSectionCore({
  draft,
  dti,
  replaceDti,
}: {
  draft: Sheet;
  dti: NonNullable<Sheet["dti"]>;
  replaceDti: (next: NonNullable<Sheet["dti"]>) => void;
}) {
  const d = dti;
  const incomes = d.incomes ?? [];
  const debts = d.debts ?? {};
  const di = deriveIntake(draft);

  function set<K extends keyof typeof d>(k: K, v: (typeof d)[K]) {
    replaceDti({ ...d, [k]: v });
  }

  function importIncomesFromIntake() {
    const rows = draft.incomeRows ?? [];
    if (rows.length === 0) return;
    const imported = rows
      .filter((r) => toNumber(r.monthlyAmount) > 0 || r.description)
      .map((r) => ({
        label: [r.borrower, r.source, r.description].filter(Boolean).join(" · ") || "Income",
        amount: r.monthlyAmount ?? "",
      }));
    set("incomes", imported.length ? imported : incomes);
  }

  function importLiabilitiesFromIntake() {
    const liabs = draft.liabilities ?? [];
    if (liabs.length === 0) return;
    const total = sumLiabilitiesMonthlyPayments(liabs);
    set("debts", { ...debts, other: String(Math.round(total * 100) / 100) });
  }

  const m = computeDtiMetrics(d);
  const {
    grossIncome,
    downAmount,
    pi,
    estTaxes,
    hoa,
    pitia,
    consumerDebtMonthly: consumer,
    totalMonthlyDebt: totalMonthly,
    frontDti,
    backDti,
  } = m;

  const dtiAlerts = useMemo(
    () =>
      buildDtiToolAlerts({
        grossIncome: m.grossIncome,
        frontDti: m.frontDti,
        backDti: m.backDti,
      }),
    [m.grossIncome, m.frontDti, m.backDti],
  );

  return (
    <div className="flex flex-col gap-5">
      {dtiAlerts.length > 0 ? (
        <IntelligentAlertsCallout alerts={dtiAlerts} maxVisible={2} />
      ) : null}
      <DealBlockAiAssistPanel
        blockKind="dti"
        fingerprint={[
          String(grossIncome),
          String(frontDti),
          String(backDti),
          String(pitia),
          String(consumer),
        ].join("|")}
        buildContext={() => ({
          grossIncome,
          frontDti,
          backDti,
          pitia,
          consumerDebtMonthly: consumer,
          totalMonthlyDebt: totalMonthly,
        })}
        onApply={(s) => {
          if (!s.patch) return;
          const merged = mergeDtiFromSanitizedPatch(d, s.patch);
          replaceDti(merged);
        }}
      />
      <SectionCard title="Debt-to-income calculator" description="All values are monthly unless noted.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Family size">
            <TextInput value={d.familySize ?? ""} onChange={(e) => set("familySize", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Monthly income"
        description={di.totalIncome > 0 ? `Intake has ${formatUSD(di.totalIncome)}/mo across ${(draft.incomeRows ?? []).length} rows.` : undefined}
        actions={
          <div className="flex gap-2">
            {di.totalIncome > 0 ? (
              <Button variant="secondary" onClick={importIncomesFromIntake}>Import from intake</Button>
            ) : null}
            <Button variant="secondary" onClick={() => set("incomes", [...incomes, { label: `Income ${incomes.length + 1}` }])}>
              + Income
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          {incomes.map((inc, i) => (
            <div key={i} className="grid grid-cols-[1fr_160px_40px] items-center gap-3">
              <TextInput value={inc.label ?? ""} onChange={(e) => set("incomes", incomes.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} />
              <TextInput value={inc.amount ?? ""} onChange={(e) => set("incomes", incomes.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))} placeholder="$/mo" />
              <Button variant="ghost" onClick={() => set("incomes", incomes.filter((_, idx) => idx !== i))}>×</Button>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          Gross monthly income: <strong>{formatUSD(grossIncome)}</strong>
        </div>
      </SectionCard>

      <SectionCard title="Proposed housing (PITIA)">
        <div className="grid gap-4 sm:grid-cols-3">
          <LinkedField
            label="Purchase price ($)"
            value={d.purchasePrice ?? ""}
            linkedValue={di.subjectValue}
            linkedFrom="Intake: Property"
            onChange={(v) => set("purchasePrice", v)}
          />
          <Field label="Down payment %">
            <TextInput value={d.downPaymentPct ?? ""} onChange={(e) => set("downPaymentPct", e.target.value)} />
          </Field>
          <ReadStat label="Down payment $" value={formatUSD(downAmount)} />
          <LinkedField
            label="Funding amount ($)"
            value={(d as { fundingAmount?: string }).fundingAmount ?? ""}
            linkedValue={di.proposedLoanAmount}
            linkedFrom="Scenario"
            onChange={(v) => set("fundingAmount", v)}
          />
          <Field label="Term (months)">
            <TextInput value={d.termMonths ?? ""} onChange={(e) => set("termMonths", e.target.value)} placeholder="360" />
          </Field>
          <Field label="Interest rate (%)">
            <TextInput value={d.interestRate ?? ""} onChange={(e) => set("interestRate", e.target.value)} />
          </Field>
          <ReadStat label="P&I" value={formatUSD(pi, 2)} />
          <Field label="Property tax rate (%)">
            <TextInput value={d.propertyTaxRate ?? ""} onChange={(e) => set("propertyTaxRate", e.target.value)} />
          </Field>
          <Field label="Taxes / mo ($)">
            <TextInput value={d.propertyTaxesMonthly ?? ""} onChange={(e) => set("propertyTaxesMonthly", e.target.value)} placeholder={formatUSD(estTaxes, 2)} />
          </Field>
          <Field label="Homeowners ins / mo ($)">
            <TextInput value={d.homeownersInsuranceMonthly ?? ""} onChange={(e) => set("homeownersInsuranceMonthly", e.target.value)} />
          </Field>
          <Field label="HOA / mo ($)">
            <TextInput value={d.hoa ?? ""} onChange={(e) => set("hoa", e.target.value)} />
          </Field>
          <Field label="FHA MI rate (%)">
            <TextInput value={d.fhaMiRate ?? ""} onChange={(e) => set("fhaMiRate", e.target.value)} />
          </Field>
          <Field label="FHA MI / mo ($)">
            <TextInput value={d.fhaMiMonthly ?? ""} onChange={(e) => set("fhaMiMonthly", e.target.value)} />
          </Field>
          <ReadStat label="PITIA" value={formatUSD(pitia, 2)} highlight />
        </div>
      </SectionCard>

      <SectionCard
        title="Consumer monthly debts"
        description={di.liabilitiesMonthly > 0 ? `Intake liabilities total ${formatUSD(di.liabilitiesMonthly)}/mo.` : undefined}
        actions={
          di.liabilitiesMonthly > 0 ? (
            <Button variant="secondary" onClick={importLiabilitiesFromIntake}>
              Import from liabilities → Other
            </Button>
          ) : null
        }
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Car(s) ($)">
            <TextInput value={debts.cars ?? ""} onChange={(e) => set("debts", { ...debts, cars: e.target.value })} />
          </Field>
          <Field label="Revolving ($)">
            <TextInput value={debts.revolving ?? ""} onChange={(e) => set("debts", { ...debts, revolving: e.target.value })} />
          </Field>
          <Field label="Installment ($)">
            <TextInput value={debts.installment ?? ""} onChange={(e) => set("debts", { ...debts, installment: e.target.value })} />
          </Field>
          <Field label="Other ($)">
            <TextInput value={debts.other ?? ""} onChange={(e) => set("debts", { ...debts, other: e.target.value })} />
          </Field>
          <ReadStat label="Consumer total" value={formatUSD(consumer)} />
          <ReadStat label="Total monthly expenses" value={formatUSD(totalMonthly)} />
          <ReadStat label="Front DTI" value={formatPct(frontDti, 1)} highlight />
          <ReadStat label="Back DTI" value={formatPct(backDti, 1)} highlight />
        </div>
        <div className="mt-4 grid gap-2 rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground sm:grid-cols-4">
          <div><strong>Fannie Mae</strong> 45%</div>
          <div><strong>Freddie Mac</strong> 45%</div>
          <div><strong>VA</strong> 41–55%</div>
          <div><strong>FHA</strong> 31 / 43%</div>
        </div>
      </SectionCard>
    </div>
  );
}

export function DtiSection(props: SectionProps) {
  const instances = useMemo(
    () => normalizeDtiInstances(props.draft),
    [props.draft]
  );
  return (
    <MultiInstanceToolShell
      singularLabel="DTI calculation"
      instances={instances}
      onInstancesChange={(next) =>
        props.update("dtiInstances", next as never)
      }
      createEmptyData={() => ({})}
      embedChrome={props.analysisWorkspaceNested}
    >
      {(inst, replaceData) => (
        <DtiSectionCore
          draft={props.draft}
          dti={inst.data as NonNullable<Sheet["dti"]>}
          replaceDti={replaceData}
        />
      )}
    </MultiInstanceToolShell>
  );
}

/* ================================= REO ================================= */

const REO_CELL =
  "h-10 min-h-[40px] min-w-0 rounded-dlc-sm border border-border/80 bg-dlc-surface px-2 text-xs text-foreground";

export function ReoSection({ draft, update }: SectionProps) {
  const editor = useDealWorkspaceEditorOptional();
  const router = useRouter();
  const rows = useMemo(
    () => sanitizeDealReoRows(draft.reo),
    [draft.reo],
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const blockAssignees = useMemo(
    () => normalizeContactIdList(draft.reoMeta?.assignedContactIds),
    [draft.reoMeta?.assignedContactIds],
  );
  const d = deriveIntake(draft);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [copyOpen, setCopyOpen] = useState(false);

  const fileId = editor?.fileId;
  const memberUserKey = (editor?.preferencesAccountId ?? "").trim();
  const organizationId = editor?.dealBundle?.pipeline?.organizationId;
  const pipelineFileLabel =
    editor?.dealBundle?.pipeline?.fileName?.trim() || "file";
  const vaultEnabled = Boolean(fileId && memberUserKey);

  const generateUploadUrl = useMutation(api.libraryDocuments.generateUploadUrl);
  const createDocument = useMutation(api.libraryDocuments.createDocument);
  const commitDocumentVersion = useMutation(
    api.libraryDocuments.commitDocumentVersion,
  );
  const patchLinkMetadata = useMutation(
    api.libraryDocuments.patchDocumentLinkMetadata,
  );
  const createFolder = useMutation(api.documentFolders.createFolder);
  const copyReoToFile = useMutation(api.pipelineContacts.copyReoToFile);
  const createFileFromReo = useMutation(api.pipelineContacts.createFileFromReo);
  const folders = useQuery(
    api.documentFolders.listFoldersByPipeline,
    vaultEnabled && fileId
      ? { pipelineFileId: fileId, memberUserKey }
      : "skip",
  );
  const linkedContacts = useQuery(
    api.contactFileLinks.listLinkedContactsForFile,
    fileId
      ? {
          fileId,
          ...(memberUserKey ? { memberUserKey } : {}),
        }
      : "skip",
  );

  const vaultMutations = useMemo((): VaultUploadMutations => {
    return {
      generateUploadUrl: (args) => generateUploadUrl(args),
      createDocument: (args) => createDocument(args),
      commitDocumentVersion: (args) => commitDocumentVersion(args),
      patchLinkMetadata: (args) => patchLinkMetadata(args),
    };
  }, [
    generateUploadUrl,
    createDocument,
    commitDocumentVersion,
    patchLinkMetadata,
  ]);

  const contactNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of linkedContacts ?? []) {
      map.set(String(c.contactId), c.name);
    }
    return map;
  }, [linkedContacts]);

  const namesForIds = useCallback(
    (ids: readonly string[] | undefined) =>
      normalizeContactIdList(ids).map(
        (id) => contactNameById.get(id) || id,
      ),
    [contactNameById],
  );

  const totals = useMemo(() => computeReoScheduleTotals(rows), [rows]);

  function persistRows(next: DealReoRow[]) {
    update(
      "reo",
      next.map((row) => withComputedReoFields(ensureDealReoRowId(row))),
    );
  }

  function persistMeta(assignedContactIds: string[]) {
    update("reoMeta", { assignedContactIds });
  }

  function setRow(i: number, patch: Partial<DealReoRow>) {
    persistRows(
      rowsRef.current.map((r, idx) =>
        idx === i ? sanitizeDealReoRow({ ...r, ...patch }) : r,
      ),
    );
  }

  function addFromSubject() {
    persistRows([
      createEmptyReoRow({
        usage:
          draft.occupancy === "Primary"
            ? "Primary"
            : draft.occupancy === "2nd Home"
              ? "2nd Home"
              : draft.occupancy === "Investment"
                ? "Rental"
                : "Primary",
        address: d.subjectAddress,
        state: d.subject.state ?? "",
        propertyType: "SFR",
        marketValue: d.subjectValue ?? "",
        position: "1st",
        balance: d.firstLoan?.currentBalance ?? "",
        mortgagePayment: d.firstLoan?.currentPI ?? "",
        rate: d.firstLoan?.currentRate ?? "",
        taxes: d.firstLoan?.taxes ?? "",
        insurance: d.firstLoan?.insurance ?? "",
        hoa: d.firstLoan?.hoa ?? "",
      }),
      ...rows,
    ]);
  }

  function addFromPrimary() {
    persistRows([
      createEmptyReoRow({
        usage: "Primary",
        address: d.primaryAddress,
        state: d.primary.state ?? "",
        propertyType: "SFR",
        marketValue: d.primary.estimatedValue ?? "",
        position: "1st",
        balance: d.primary.estCurrentMortgageBalance ?? "",
      }),
      ...rows,
    ]);
  }

  const buildPdfSpec = useCallback(() => {
    return buildReoBlockPdfSpec(rows, {
      fileName: buildBlockPdfVaultFileName(
        "Schedule-of-Real-Estate-Owned",
        pipelineFileLabel,
      ),
      assignedContactNames: namesForIds(blockAssignees),
      rowAssigneeNames: rows.map((r) => namesForIds(r.assignedContactIds)),
    });
  }, [rows, pipelineFileLabel, namesForIds, blockAssignees]);

  const savePdfToVault = useCallback(async () => {
    if (!memberUserKey || !fileId) {
      throw new Error("Sign in to save to Document Vault.");
    }
    if (folders === undefined) {
      throw new Error("Document Vault is still loading. Try again in a moment.");
    }
    const { folderId, folderName } = await resolveBlockPdfVaultFolder({
      folders,
      pipelineFileId: fileId,
      memberUserKey,
      createFolder: (args) => createFolder(args),
      defaultFolderName: "REO",
    });
    const saved = await saveBlockFillablePdfToVault(buildPdfSpec(), {
      proof: { kind: "pipeline", pipelineFileId: fileId },
      memberUserKey,
      mutations: vaultMutations,
      folderId,
      title: "Schedule of Real Estate Owned",
    });
    showOperationalToast({
      title: "Saved to Document Vault",
      description: `${saved.fileName} · ${folderName} folder · Open the Documents tab to view it.`,
      variant: "success",
      durationMs: 5200,
    });
  }, [
    memberUserKey,
    fileId,
    folders,
    createFolder,
    vaultMutations,
    buildPdfSpec,
  ]);

  const showSubjectCta = Boolean(d.subjectAddress) && !d.subjectInReo;
  const showPrimaryCta =
    Boolean(d.primaryAddress) && !d.subjectIsPrimary && !d.primaryInReo;
  const selectedIndexes = useMemo(
    () => [...selected].sort((a, b) => a - b),
    [selected],
  );

  const inputClass = REO_CELL;

  return (
    <div className="flex flex-col gap-5">
      {showSubjectCta || showPrimaryCta ? (
        <div className="rounded-dlc-lg border border-dashed border-border bg-dlc-surface-high/40 p-4 text-sm">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Linked properties from Intake
          </p>
          <ul className="flex flex-col gap-2">
            {showSubjectCta ? (
              <li className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    Subject property
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.subjectAddress}
                  </div>
                </div>
                <Button variant="secondary" onClick={addFromSubject}>
                  + Add to schedule
                </Button>
              </li>
            ) : null}
            {showPrimaryCta ? (
              <li className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    Primary residence
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.primaryAddress}
                  </div>
                </div>
                <Button variant="secondary" onClick={addFromPrimary}>
                  + Add to schedule
                </Button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <SectionCard
        title="Schedule of Real Estate Owned"
        description="Full workbook schedule: escrow = taxes + insurance + HOA; net rent = gross rent − (taxes + insurance + HOA + mortgage payment)."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {fileId ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-10"
                data-testid="reo-copy-to-file"
                onClick={() => setCopyOpen(true)}
              >
                <Copy className="h-4 w-4" aria-hidden />
                Bring into file
              </Button>
            ) : null}
            <BlockPdfExportButton
              testId="reo-block-pdf-export"
              label="Fillable Schedule of REO PDF"
              buildSpec={buildPdfSpec}
              onSaveToVault={vaultEnabled ? savePdfToVault : undefined}
            />
            <Button
              variant="secondary"
              className="min-h-10"
              onClick={() =>
                persistRows([...rows, createEmptyReoRow({ usage: "Rental" })])
              }
            >
              + Property
            </Button>
          </div>
        }
      >
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Block assignees
            </p>
            <ReoContactMultiAssign
              selectedIds={blockAssignees}
              onChange={persistMeta}
              organizationId={organizationId}
              memberUserKey={memberUserKey || undefined}
              fileId={fileId}
              label="Assign schedule to contacts"
            />
          </div>
        </div>

        <div className="max-w-full overflow-x-auto overscroll-x-contain max-md:touch-pan-x [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[2400px] border-separate border-spacing-y-2 text-xs">
            <thead>
              <tr className="text-left font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-2"> </th>
                <th className="px-2">#</th>
                <th className="px-2">Purchased</th>
                <th className="px-2">ST</th>
                <th className="px-2">Use</th>
                <th className="px-2">Address</th>
                <th className="px-2">Type</th>
                <th className="px-2">Market value / listing</th>
                <th className="px-2">Pos</th>
                <th className="px-2">Balance</th>
                <th className="px-2">Mort pmt</th>
                <th className="px-2">Rate %</th>
                <th className="px-2">Taxes</th>
                <th className="px-2">Ins</th>
                <th className="px-2">HOA</th>
                <th className="px-2">Escrow</th>
                <th className="px-2">Gross rent</th>
                <th className="px-2">Net rent</th>
                <th className="px-2">Equity</th>
                <th className="px-2">LTV</th>
                <th className="px-2">APN</th>
                <th className="px-2">Invested</th>
                <th className="px-2">Lat/Long</th>
                <th className="px-2">Lot SF</th>
                <th className="px-2">Prop SF</th>
                <th className="px-2">Most recent</th>
                <th className="px-2">Assigned</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const computed = computeReoRow(r);
                const rowKey = r.rowId || `reo-row-${i}`;
                const checked = selected.has(i);
                return (
                  <tr
                    key={rowKey}
                    className={cn(
                      i % 2 === 0
                        ? "bg-dlc-surface"
                        : "bg-dlc-surface-high/60",
                    )}
                  >
                    <td className="rounded-l-lg px-1">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-primary"
                        checked={checked}
                        aria-label={`Select property ${i + 1}`}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(i);
                            else next.delete(i);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-1">
                      <TextInput
                        type="date"
                        className={inputClass}
                        value={toHtmlDateInputValue(r.purchasedDate)}
                        onChange={(e) =>
                          setRow(i, { purchasedDate: e.target.value })
                        }
                      />
                    </td>
                    <td className="w-14 px-1">
                      <TextInput
                        className={inputClass}
                        value={r.state ?? ""}
                        onChange={(e) => setRow(i, { state: e.target.value })}
                      />
                    </td>
                    <td className="px-1">
                      <Select
                        className={inputClass}
                        value={r.usage ?? ""}
                        onChange={(e) => setRow(i, { usage: e.target.value })}
                        aria-label={`Use ${i + 1}`}
                      >
                        <option value="">—</option>
                        {r.usage &&
                        !(REO_USAGE_OPTIONS as readonly string[]).includes(
                          r.usage,
                        ) ? (
                          <option value={r.usage}>{r.usage}</option>
                        ) : null}
                        {REO_USAGE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="min-w-[180px] px-1">
                      <TextInput
                        className={inputClass}
                        value={r.address ?? ""}
                        onChange={(e) => setRow(i, { address: e.target.value })}
                      />
                    </td>
                    <td className="w-24 px-1">
                      <Select
                        className={inputClass}
                        value={r.propertyType ?? ""}
                        onChange={(e) =>
                          setRow(i, { propertyType: e.target.value })
                        }
                        aria-label={`Property type ${i + 1}`}
                      >
                        <option value="">—</option>
                        {r.propertyType &&
                        !(REO_PROPERTY_TYPE_OPTIONS as readonly string[]).includes(
                          r.propertyType,
                        ) ? (
                          <option value={r.propertyType}>{r.propertyType}</option>
                        ) : null}
                        {REO_PROPERTY_TYPE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="w-40 px-1">
                      <div className="flex min-w-0 items-center gap-1">
                        <TextInput
                          className={cn(inputClass, "min-w-0 flex-1")}
                          inputMode="decimal"
                          value={r.marketValue ?? ""}
                          onChange={(e) =>
                            setRow(i, { marketValue: e.target.value })
                          }
                          aria-label={`Market value ${i + 1}`}
                        />
                        <ReoZillowUrlControl
                          value={r.zillowUrl}
                          onChange={(next) =>
                            setRow(i, { zillowUrl: next })
                          }
                          rowLabel={
                            (r.address ?? "").trim() || `property ${i + 1}`
                          }
                        />
                      </div>
                    </td>
                    <td className="w-20 px-1">
                      <Select
                        className={inputClass}
                        value={r.position ?? ""}
                        onChange={(e) =>
                          setRow(i, { position: e.target.value })
                        }
                        aria-label={`Position ${i + 1}`}
                      >
                        <option value="">—</option>
                        {r.position &&
                        !(REO_POSITION_OPTIONS as readonly string[]).includes(
                          r.position,
                        ) ? (
                          <option value={r.position}>{r.position}</option>
                        ) : null}
                        {REO_POSITION_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="w-28 px-1">
                      <TextInput
                        className={inputClass}
                        inputMode="decimal"
                        value={r.balance ?? ""}
                        onChange={(e) => setRow(i, { balance: e.target.value })}
                      />
                    </td>
                    <td className="w-24 px-1">
                      <TextInput
                        className={inputClass}
                        inputMode="decimal"
                        value={r.mortgagePayment ?? ""}
                        onChange={(e) =>
                          setRow(i, { mortgagePayment: e.target.value })
                        }
                      />
                    </td>
                    <td className="w-20 px-1">
                      <TextInput
                        className={inputClass}
                        inputMode="decimal"
                        value={r.rate ?? ""}
                        onChange={(e) => setRow(i, { rate: e.target.value })}
                      />
                    </td>
                    <td className="w-24 px-1">
                      <TextInput
                        className={inputClass}
                        inputMode="decimal"
                        value={r.taxes ?? ""}
                        onChange={(e) => setRow(i, { taxes: e.target.value })}
                      />
                    </td>
                    <td className="w-24 px-1">
                      <TextInput
                        className={inputClass}
                        inputMode="decimal"
                        value={r.insurance ?? ""}
                        onChange={(e) =>
                          setRow(i, { insurance: e.target.value })
                        }
                      />
                    </td>
                    <td className="w-20 px-1">
                      <TextInput
                        className={inputClass}
                        inputMode="decimal"
                        value={r.hoa ?? ""}
                        onChange={(e) => setRow(i, { hoa: e.target.value })}
                      />
                    </td>
                    <td className="w-24 px-1">
                      <span
                        className="flex h-10 min-h-[40px] items-center justify-end px-2 tabular-nums text-foreground"
                        title="Taxes + insurance + HOA"
                      >
                        {formatReoUsd(computed.escrow)}
                      </span>
                    </td>
                    <td className="w-24 px-1">
                      <TextInput
                        className={inputClass}
                        inputMode="decimal"
                        value={r.grossRent ?? ""}
                        onChange={(e) =>
                          setRow(i, { grossRent: e.target.value })
                        }
                      />
                    </td>
                    <td className="w-24 px-1">
                      <span
                        className="flex h-10 min-h-[40px] items-center justify-end px-2 tabular-nums text-foreground"
                        title="Gross rent − (taxes + insurance + HOA + mortgage payment)"
                      >
                        {formatReoUsd(computed.netRent)}
                      </span>
                    </td>
                    <td className="w-24 px-1">
                      <span className="flex h-10 min-h-[40px] items-center justify-end px-2 tabular-nums text-foreground">
                        {formatReoUsd(computed.equity)}
                      </span>
                    </td>
                    <td className="w-16 px-1">
                      <span className="flex h-10 min-h-[40px] items-center justify-end px-2 tabular-nums text-foreground">
                        {formatReoLtv(computed.ltv)}
                      </span>
                    </td>
                    <td className="w-24 px-1">
                      <TextInput
                        className={inputClass}
                        value={r.apn ?? ""}
                        onChange={(e) => setRow(i, { apn: e.target.value })}
                      />
                    </td>
                    <td className="w-24 px-1">
                      <TextInput
                        className={inputClass}
                        inputMode="decimal"
                        value={r.invested ?? ""}
                        onChange={(e) => setRow(i, { invested: e.target.value })}
                      />
                    </td>
                    <td className="min-w-[120px] px-1">
                      <TextInput
                        className={inputClass}
                        value={r.latLong ?? ""}
                        onChange={(e) => setRow(i, { latLong: e.target.value })}
                        placeholder="lat, lng"
                      />
                    </td>
                    <td className="w-20 px-1">
                      <TextInput
                        className={inputClass}
                        inputMode="decimal"
                        value={r.lotSf ?? ""}
                        onChange={(e) => setRow(i, { lotSf: e.target.value })}
                      />
                    </td>
                    <td className="w-20 px-1">
                      <TextInput
                        className={inputClass}
                        inputMode="decimal"
                        value={r.propSf ?? ""}
                        onChange={(e) => setRow(i, { propSf: e.target.value })}
                      />
                    </td>
                    <td className="w-32 px-1">
                      <TextInput
                        type="date"
                        className={inputClass}
                        value={toHtmlDateInputValue(r.mostRecent)}
                        onChange={(e) =>
                          setRow(i, { mostRecent: e.target.value })
                        }
                      />
                    </td>
                    <td className="min-w-[160px] px-1">
                      <ReoContactMultiAssign
                        compact
                        selectedIds={normalizeContactIdList(r.assignedContactIds)}
                        onChange={(ids) =>
                          setRow(i, { assignedContactIds: ids })
                        }
                        organizationId={organizationId}
                        memberUserKey={memberUserKey || undefined}
                        fileId={fileId}
                        label={`Assign property ${i + 1}`}
                      />
                    </td>
                    <td className="rounded-r-lg px-1 text-right">
                      <Button
                        variant="ghost"
                        className="h-10 min-h-[40px] w-10 p-0"
                        aria-label={`Remove property ${i + 1}`}
                        onClick={() => {
                          persistRows(rows.filter((_, idx) => idx !== i));
                          setSelected((prev) => {
                            const next = new Set<number>();
                            for (const idx of prev) {
                              if (idx === i) continue;
                              next.add(idx > i ? idx - 1 : idx);
                            }
                            return next;
                          });
                        }}
                      >
                        ×
                      </Button>
                    </td>
                  </tr>
                );
              })}
              <tr className="text-[11px] font-semibold text-foreground/90">
                <td className="px-2" colSpan={7}>
                  TOTALS
                </td>
                <td className="px-2 tabular-nums">
                  {formatUSD(totals.marketValue)}
                </td>
                <td />
                <td className="px-2 tabular-nums">
                  {formatUSD(totals.balance)}
                </td>
                <td className="px-2 tabular-nums">
                  {formatUSD(totals.mortgagePayment)}
                </td>
                <td />
                <td className="px-2 tabular-nums">{formatUSD(totals.taxes)}</td>
                <td className="px-2 tabular-nums">
                  {formatUSD(totals.insurance)}
                </td>
                <td className="px-2 tabular-nums">{formatUSD(totals.hoa)}</td>
                <td className="px-2 tabular-nums">
                  {formatUSD(totals.escrow)}
                </td>
                <td className="px-2 tabular-nums">
                  {formatUSD(totals.grossRent)}
                </td>
                <td className="px-2 tabular-nums">
                  {formatUSD(totals.netRent)}
                </td>
                <td className="px-2 tabular-nums">
                  {formatUSD(totals.equity)}
                </td>
                <td />
                <td />
                <td className="px-2 tabular-nums">
                  {formatUSD(totals.invested)}
                </td>
                <td colSpan={5} />
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      {fileId ? (
        <ScheduleCopyToFileDialog
          open={copyOpen}
          onClose={() => setCopyOpen(false)}
          sourceFileId={fileId}
          memberUserKey={memberUserKey || undefined}
          selectedRowIndexes={selectedIndexes}
          defaultMode={selectedIndexes.length > 0 ? "rows" : "block"}
          title="Bring REO into another file"
          description="Copy selected property rows or the entire Schedule of REO into another loan file — or create a new file. Assignees travel with the data."
          rowNounSingular="property"
          rowNounPlural="properties"
          testId="reo-copy-to-file-dialog"
          onCopy={async ({ targetFileId, mode, rowIndexes }) => {
            const result = await copyReoToFile({
              sourceFileId: fileId,
              targetFileId,
              mode,
              ...(mode === "rows" ? { rowIndexes } : {}),
              ...(memberUserKey
                ? { preferencesAccountId: memberUserKey }
                : {}),
            });
            if (!result.ok) return { ok: false as const };
            return {
              ok: true as const,
              copiedRowCount: result.copiedRowCount,
            };
          }}
          onCreateNewFile={
            memberUserKey
              ? async ({ mode, rowIndexes }) => {
                  const result = await createFileFromReo({
                    sourceFileId: fileId,
                    mode,
                    ...(mode === "rows" ? { rowIndexes } : {}),
                    preferencesAccountId: memberUserKey,
                  });
                  router.push(
                    pipelineDealEditorHref(result.targetFileId, {
                      tab: "dealInfo",
                    }),
                  );
                  return {
                    ok: true as const,
                    copiedRowCount: result.copiedRowCount,
                    targetFileId: result.targetFileId,
                    fileName: result.fileName,
                  };
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

/* ============================== Comparison ============================== */

function ComparisonSectionCore({
  draft,
  comparison,
  replaceComparison,
}: {
  draft: Sheet;
  comparison: ComparisonData;
  replaceComparison: (next: ComparisonData) => void;
}) {
  const c = comparison;
  const cur = c.current ?? {};
  const prop = c.proposed ?? {};
  const di = deriveIntake(draft);

  function set<K extends keyof typeof c>(k: K, v: (typeof c)[K]) {
    replaceComparison({ ...c, [k]: v });
  }

  function importCurrentFromIntake() {
    const loan = di.firstLoan;
    if (!loan) return;
    set("current", {
      fundingAmount: loan.currentBalance ?? "",
      ratePct: loan.currentRate ?? "",
      termMonths: "360",
      escrowMonthly: String(
        toNumber(loan.taxes) + toNumber(loan.insurance) + toNumber(loan.hoa) || "",
      ),
    });
  }

  function side(label: string, side: typeof cur, setSide: (v: typeof cur) => void, importBtn?: React.ReactNode) {
    const {
      pi,
      interest,
      principal,
      escrow,
      total,
      lifeTotal,
    } = computeComparisonLoanSideMetrics(side);
    return {
      pi,
      interest,
      principal,
      escrow,
      total,
      lifeTotal,
      render: (
        <SectionCard title={label} actions={importBtn}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Funding amount ($)">
              <TextInput value={side.fundingAmount ?? ""} onChange={(e) => setSide({ ...side, fundingAmount: e.target.value })} />
            </Field>
            <Field label="Rate (%)">
              <TextInput value={side.ratePct ?? ""} onChange={(e) => setSide({ ...side, ratePct: e.target.value })} />
            </Field>
            <Field label="Term (months)">
              <TextInput value={side.termMonths ?? ""} onChange={(e) => setSide({ ...side, termMonths: e.target.value })} placeholder="360" />
            </Field>
            <Field label="Escrow / mo ($)">
              <TextInput value={side.escrowMonthly ?? ""} onChange={(e) => setSide({ ...side, escrowMonthly: e.target.value })} />
            </Field>
            <ReadStat label="P&I" value={formatUSD(pi, 2)} />
            <ReadStat label="Interest / mo" value={formatUSD(interest, 2)} />
            <ReadStat label="Principal / mo" value={formatUSD(principal, 2)} />
            <ReadStat label="Total payment" value={formatUSD(total, 2)} highlight />
            <ReadStat label="Life total repayment" value={formatUSD(lifeTotal)} />
          </div>
        </SectionCard>
      ),
    };
  }

  const current = side(
    "Current loan",
    cur,
    (v) => set("current", v),
    di.firstLoan ? (
      <Button variant="secondary" onClick={importCurrentFromIntake}>Import from Intake: Loans</Button>
    ) : undefined,
  );
  const proposed = side("New loan", prop, (v) => set("proposed", v));

  const diffPmt = current.total - proposed.total;
  const diffInt = current.interest - proposed.interest;
  const diffPrin = proposed.principal - current.principal;
  const yearlySavings = diffPmt * 12;
  const lifeSavings = current.lifeTotal - proposed.lifeTotal;

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Loan comparison" description="Side-by-side breakdown of the existing loan versus a proposed scenario.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prepared for">
            <TextInput value={c.preparedFor ?? ""} onChange={(e) => set("preparedFor", e.target.value)} />
          </Field>
          <Field label="As of">
            <TextInput type="date" value={c.asOfDate ?? ""} onChange={(e) => set("asOfDate", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        {current.render}
        {proposed.render}
      </div>

      <SectionCard
        title="Benefit summary"
        actions={
          <span className="text-sm text-muted-foreground">
            Yearly savings: <strong>{formatUSD(yearlySavings)}</strong>
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <ReadStat label="Monthly payment change" value={formatUSD(diffPmt, 2)} highlight={diffPmt >= 0} />
          <ReadStat label="Interest change / mo" value={formatUSD(diffInt, 2)} />
          <ReadStat label="Extra principal / mo" value={formatUSD(diffPrin, 2)} />
          <ReadStat label="Yearly savings" value={formatUSD(yearlySavings)} />
          <ReadStat label="Life-of-loan savings" value={formatUSD(lifeSavings)} highlight={lifeSavings >= 0} />
        </div>
        <div className="mt-4">
          <Field label="Notes">
            <TextArea value={c.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

export function ComparisonSection(props: SectionProps) {
  const instances = useMemo(
    () => normalizeComparisonInstances(props.draft),
    [props.draft]
  );
  return (
    <MultiInstanceToolShell
      singularLabel="Loan comparison"
      instances={instances}
      onInstancesChange={(next) =>
        props.update("comparisonInstances", next as never)
      }
      createEmptyData={() => ({})}
      embedChrome={props.analysisWorkspaceNested}
    >
      {(inst, replaceData) => (
        <ComparisonSectionCore
          draft={props.draft}
          comparison={inst.data as ComparisonData}
          replaceComparison={replaceData}
        />
      )}
    </MultiInstanceToolShell>
  );
}

/* =========================== Business debt schedule =========================== */

const BD_CELL =
  "h-10 min-h-[40px] min-w-0 rounded-dlc-sm border border-border/80 bg-dlc-surface px-2 text-xs text-foreground";

/** Tab 2 Deal Info — flat `weightedInterest` schedule (dual-write to CRM). */
export function BusinessDebtSection({ draft, update }: DealSectionProps) {
  const editor = useDealWorkspaceEditorOptional();
  const rows = useMemo(
    () => sanitizeDealBusinessDebtRows(draft.weightedInterest),
    [draft.weightedInterest],
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const blockAssignees = useMemo(
    () => normalizeContactIdList(draft.businessDebtMeta?.assignedContactIds),
    [draft.businessDebtMeta?.assignedContactIds],
  );
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [copyOpen, setCopyOpen] = useState(false);

  const fileId = editor?.fileId;
  const memberUserKey = (editor?.preferencesAccountId ?? "").trim();
  const organizationId = editor?.dealBundle?.pipeline?.organizationId;
  const pipelineFileLabel =
    editor?.dealBundle?.pipeline?.fileName?.trim() || "file";
  const vaultEnabled = Boolean(fileId && memberUserKey);

  const generateUploadUrl = useMutation(api.libraryDocuments.generateUploadUrl);
  const createDocument = useMutation(api.libraryDocuments.createDocument);
  const commitDocumentVersion = useMutation(
    api.libraryDocuments.commitDocumentVersion,
  );
  const patchLinkMetadata = useMutation(
    api.libraryDocuments.patchDocumentLinkMetadata,
  );
  const createFolder = useMutation(api.documentFolders.createFolder);
  const copyBusinessDebt = useMutation(api.pipelineContacts.copyBusinessDebtToFile);
  const folders = useQuery(
    api.documentFolders.listFoldersByPipeline,
    vaultEnabled && fileId
      ? { pipelineFileId: fileId, memberUserKey }
      : "skip",
  );
  const linkedContacts = useQuery(
    api.contactFileLinks.listLinkedContactsForFile,
    fileId
      ? {
          fileId,
          ...(memberUserKey ? { memberUserKey } : {}),
        }
      : "skip",
  );

  const vaultMutations = useMemo((): VaultUploadMutations => {
    return {
      generateUploadUrl: (args) => generateUploadUrl(args),
      createDocument: (args) => createDocument(args),
      commitDocumentVersion: (args) => commitDocumentVersion(args),
      patchLinkMetadata: (args) => patchLinkMetadata(args),
    };
  }, [
    generateUploadUrl,
    createDocument,
    commitDocumentVersion,
    patchLinkMetadata,
  ]);

  const contactNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of linkedContacts ?? []) {
      map.set(String(c.contactId), c.name);
    }
    return map;
  }, [linkedContacts]);

  const namesForIds = useCallback(
    (ids: readonly string[] | undefined) =>
      normalizeContactIdList(ids).map((id) => contactNameById.get(id) || id),
    [contactNameById],
  );

  const totals = useMemo(
    () => computeBusinessDebtScheduleTotals(rows),
    [rows],
  );

  function persistRows(next: DealBusinessDebtRow[]) {
    update(
      "weightedInterest",
      next.map((row) => ensureDealBusinessDebtRowId(row)),
    );
  }

  function persistMeta(assignedContactIds: string[]) {
    update("businessDebtMeta", { assignedContactIds });
  }

  function setRow(i: number, patch: Partial<DealBusinessDebtRow>) {
    persistRows(
      rowsRef.current.map((r, idx) =>
        idx === i ? sanitizeDealBusinessDebtRow({ ...r, ...patch }) : r,
      ),
    );
  }

  const buildPdfSpec = useCallback(() => {
    return buildBusinessDebtBlockPdfSpec(rows, {
      fileName: buildBlockPdfVaultFileName(
        "Schedule-of-Business-Debt",
        pipelineFileLabel,
      ),
      assignedContactNames: namesForIds(blockAssignees),
      rowAssigneeNames: rows.map((r) => namesForIds(r.assignedContactIds)),
    });
  }, [rows, pipelineFileLabel, namesForIds, blockAssignees]);

  const savePdfToVault = useCallback(async () => {
    if (!memberUserKey || !fileId) {
      throw new Error("Sign in to save to Document Vault.");
    }
    if (folders === undefined) {
      throw new Error("Document Vault is still loading. Try again in a moment.");
    }
    const { folderId, folderName } = await resolveBlockPdfVaultFolder({
      folders,
      pipelineFileId: fileId,
      memberUserKey,
      createFolder: (args) => createFolder(args),
      defaultFolderName: "Forms",
    });
    const saved = await saveBlockFillablePdfToVault(buildPdfSpec(), {
      proof: { kind: "pipeline", pipelineFileId: fileId },
      memberUserKey,
      mutations: vaultMutations,
      folderId,
      title: "Schedule of Business Debt",
    });
    showOperationalToast({
      title: "Saved to Document Vault",
      description: `${saved.fileName} · ${folderName} folder · Open the Documents tab to view it.`,
      variant: "success",
      durationMs: 5200,
    });
  }, [
    memberUserKey,
    fileId,
    folders,
    createFolder,
    vaultMutations,
    buildPdfSpec,
  ]);

  const selectedIndexes = useMemo(
    () => [...selected].sort((a, b) => a - b),
    [selected],
  );

  return (
    <SectionCard
      title="Schedule of business debt"
      description="Corporate liabilities and MCAs for stacking. Required: creditor, type, original amount, origination date, present balance, rate/factor, maturity, and monthly payment."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {fileId ? (
            <Button
              type="button"
              variant="secondary"
              className="h-10 min-h-[40px]"
              data-testid="business-debt-copy-to-file"
              onClick={() => setCopyOpen(true)}
            >
              <Copy className="h-4 w-4" aria-hidden />
              Copy to file
            </Button>
          ) : null}
          <BlockPdfExportButton
            testId="business-debt-pdf-export"
            label="Fillable Schedule of Business Debt PDF"
            buildSpec={buildPdfSpec}
            onSaveToVault={vaultEnabled ? savePdfToVault : undefined}
          />
          <Button
            variant="secondary"
            className="h-10 min-h-[40px]"
            onClick={() => persistRows([...rows, createEmptyBusinessDebtRow()])}
          >
            + Add liability
          </Button>
        </div>
      }
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <ReoContactMultiAssign
          selectedIds={blockAssignees}
          onChange={persistMeta}
          organizationId={organizationId}
          memberUserKey={memberUserKey || undefined}
          fileId={fileId}
          label="Assign schedule to contacts"
        />
        <p className="text-sm text-muted-foreground">
          Original: <strong>{formatBusinessDebtUsd(totals.originalAmount)}</strong>
          {" · "}
          Present: <strong>{formatBusinessDebtUsd(totals.presentBalance)}</strong>
          {" · "}
          Payments / mo:{" "}
          <strong>{formatBusinessDebtUsd(totals.monthlyPayment)}</strong>
        </p>
      </div>
      <div className="max-w-full overflow-x-auto overscroll-x-contain max-md:touch-pan-x [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[1480px] border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-2 text-center">Sel</th>
              <th className="px-2 text-center">Active</th>
              <th className="px-2">Creditor</th>
              <th className="px-2">Debt type</th>
              <th className="px-2">Other type</th>
              <th className="px-2">Original amount</th>
              <th className="px-2">Origination</th>
              <th className="px-2">Present balance</th>
              <th className="px-2">Rate / factor</th>
              <th className="px-2">Maturity</th>
              <th className="px-2">Monthly payment</th>
              <th className="px-2">Note</th>
              <th className="px-2">Contacts</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.rowId || `bd-row-${i}`}
                className={cn(
                  i % 2 === 0
                    ? "bg-white dark:bg-slate-800"
                    : "bg-slate-50 dark:bg-slate-800/70",
                )}
              >
                <td className="rounded-l-lg px-2 text-center">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-primary"
                    checked={selected.has(i)}
                    aria-label={`Select ${r.account || `debt ${i + 1}`}`}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(i);
                        else next.delete(i);
                        return next;
                      });
                    }}
                  />
                </td>
                <td className="px-2 text-center">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-input accent-primary"
                    checked={r.include !== false}
                    onChange={(e) => setRow(i, { include: e.target.checked })}
                    aria-label={`Include ${r.account || `debt ${i + 1}`}`}
                  />
                </td>
                <td className="min-w-[140px] px-1">
                  <TextInput
                    className={BD_CELL}
                    value={r.account ?? ""}
                    onChange={(e) => setRow(i, { account: e.target.value })}
                    aria-label="Creditor"
                  />
                </td>
                <td className="min-w-[140px] px-1">
                  <Select
                    className={BD_CELL}
                    value={r.debtType ?? ""}
                    onChange={(e) =>
                      setRow(i, {
                        debtType: e.target.value,
                        ...(e.target.value !== "Other"
                          ? { debtTypeOther: "" }
                          : {}),
                      })
                    }
                    aria-label="Debt type"
                  >
                    <option value="">—</option>
                    {r.debtType && !isBusinessDebtType(r.debtType) ? (
                      <option value={r.debtType}>{r.debtType}</option>
                    ) : null}
                    {BUSINESS_DEBT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="min-w-[120px] px-1">
                  <TextInput
                    className={BD_CELL}
                    value={r.debtTypeOther ?? ""}
                    onChange={(e) =>
                      setRow(i, { debtTypeOther: e.target.value })
                    }
                    disabled={(r.debtType ?? "") !== "Other"}
                    placeholder={
                      (r.debtType ?? "") === "Other" ? "Specify…" : ""
                    }
                    aria-label="Other debt type"
                  />
                </td>
                <td className="w-28 px-1">
                  <TextInput
                    className={BD_CELL}
                    value={r.originalAmount ?? ""}
                    onChange={(e) =>
                      setRow(i, { originalAmount: e.target.value })
                    }
                    inputMode="decimal"
                    aria-label="Original debt amount"
                  />
                </td>
                <td className="w-32 px-1">
                  <TextInput
                    type="date"
                    className={BD_CELL}
                    value={toHtmlDateInputValue(r.originationDate)}
                    onChange={(e) =>
                      setRow(i, { originationDate: e.target.value })
                    }
                    aria-label="Origination date"
                  />
                </td>
                <td className="w-28 px-1">
                  <TextInput
                    className={BD_CELL}
                    value={r.balance ?? ""}
                    onChange={(e) => setRow(i, { balance: e.target.value })}
                    inputMode="decimal"
                    aria-label="Present balance"
                  />
                </td>
                <td className="w-24 px-1">
                  <TextInput
                    className={BD_CELL}
                    value={r.ratePct ?? ""}
                    onChange={(e) => setRow(i, { ratePct: e.target.value })}
                    aria-label="Current interest rate or factor rate"
                  />
                </td>
                <td className="w-32 px-1">
                  <TextInput
                    type="date"
                    className={BD_CELL}
                    value={toHtmlDateInputValue(r.maturityDate)}
                    onChange={(e) =>
                      setRow(i, { maturityDate: e.target.value })
                    }
                    aria-label="Maturity date"
                  />
                </td>
                <td className="w-28 px-1">
                  <TextInput
                    className={BD_CELL}
                    value={r.monthlyPayment ?? ""}
                    onChange={(e) =>
                      setRow(i, { monthlyPayment: e.target.value })
                    }
                    inputMode="decimal"
                    aria-label="Monthly payment"
                  />
                </td>
                <td className="min-w-[120px] px-1">
                  <TextInput
                    className={BD_CELL}
                    value={r.note ?? ""}
                    onChange={(e) => setRow(i, { note: e.target.value })}
                    aria-label="Position or note"
                  />
                </td>
                <td className="min-w-[160px] px-1">
                  <ReoContactMultiAssign
                    selectedIds={normalizeContactIdList(r.assignedContactIds)}
                    onChange={(ids) => setRow(i, { assignedContactIds: ids })}
                    organizationId={organizationId}
                    memberUserKey={memberUserKey || undefined}
                    fileId={fileId}
                    compact
                    label={`Assign ${r.account || `debt ${i + 1}`} to contacts`}
                  />
                </td>
                <td className="rounded-r-lg px-1 text-right">
                  <Button
                    variant="ghost"
                    className="h-10 min-h-[40px] w-10 min-w-[40px] p-0"
                    aria-label={`Remove ${r.account || `debt ${i + 1}`}`}
                    onClick={() => {
                      persistRows(rows.filter((_, idx) => idx !== i));
                      setSelected((prev) => {
                        const next = new Set<number>();
                        for (const idx of prev) {
                          if (idx === i) continue;
                          next.add(idx > i ? idx - 1 : idx);
                        }
                        return next;
                      });
                    }}
                  >
                    ×
                  </Button>
                </td>
              </tr>
            ))}
            <tr className="text-xs font-semibold text-foreground/90">
              <td className="px-2" colSpan={5}>
                TOTALS (active)
              </td>
              <td className="px-2">
                {formatBusinessDebtUsd(totals.originalAmount)}
              </td>
              <td />
              <td className="px-2">
                {formatBusinessDebtUsd(totals.presentBalance)}
              </td>
              <td />
              <td />
              <td className="px-2">
                {formatBusinessDebtUsd(totals.monthlyPayment)}
              </td>
              <td />
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {fileId ? (
        <ScheduleCopyToFileDialog
          open={copyOpen}
          onClose={() => setCopyOpen(false)}
          sourceFileId={fileId}
          memberUserKey={memberUserKey || undefined}
          selectedRowIndexes={selectedIndexes}
          defaultMode={selectedIndexes.length > 0 ? "rows" : "block"}
          title="Bring business debt into another file"
          description="Copy selected debts or the entire Schedule of Business Debt. Complete rows travel with assignees; destination debts stay in place."
          rowNounSingular="debt"
          rowNounPlural="debts"
          testId="business-debt-copy-to-file-dialog"
          onCopy={async ({ targetFileId, mode, rowIndexes }) => {
            const result = await copyBusinessDebt({
              sourceFileId: fileId,
              targetFileId,
              mode,
              ...(mode === "rows" ? { rowIndexes } : {}),
              ...(memberUserKey
                ? { preferencesAccountId: memberUserKey }
                : {}),
            });
            return result.ok
              ? { ok: true as const, copiedRowCount: result.copiedRowCount }
              : { ok: false as const };
          }}
        />
      ) : null}
    </SectionCard>
  );
}

/* =========================== Weighted Interest =========================== */

function WeightedInterestSectionCore({
  draft,
  data,
  replaceData,
}: {
  draft: Sheet;
  data: WeightedData;
  replaceData: (next: WeightedData) => void;
}) {
  const rows = data.rows ?? [];
  const liabs = draft.liabilities ?? [];

  function setRow(i: number, patch: Partial<(typeof rows)[number]>) {
    replaceData({
      rows: rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    });
  }

  function importFromLiabilities() {
    const imported = liabs
      .filter((l) => l.description || toNumber(l.balance) > 0)
      .map((l) => ({
        account: l.description ?? "",
        balance: l.balance ?? "",
        monthlyPayment: l.monthlyPayment ?? "",
        note: l.notes ?? "",
        include: true,
      }));
    replaceData({
      rows: imported.length ? imported : rows,
    });
  }

  const totalBalance = rows
    .filter((r) => r.include !== false)
    .reduce((s, r) => s + toNumber(r.balance), 0);
  const totalMonthly = sumWeightedInterestMonthlyPayments(rows);
  const weighted = computeWeightedAverageRateByBalance(rows);

  return (
    <SectionCard
      title="Weighted interest rate average"
      description={`Blend of all debts the borrower plans to pay off. Intake has ${liabs.length} liability row${liabs.length === 1 ? "" : "s"}.`}
      actions={
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Weighted rate: <strong>{formatPct(weighted, 3)}</strong>
          </span>
          {liabs.length > 0 ? (
            <Button variant="secondary" onClick={importFromLiabilities}>Import from liabilities</Button>
          ) : null}
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 text-center">Use</th>
              <th className="px-3">Account</th>
              <th className="px-3">Balance</th>
              <th className="px-3">Rate %</th>
              <th className="px-3">Monthly $</th>
              <th className="px-3">Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={cn(
                  i % 2 === 0
                    ? "bg-white dark:bg-slate-800"
                    : "bg-slate-50 dark:bg-slate-800/70",
                )}
              >
                <td className="rounded-l-lg px-2 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={r.include !== false}
                    onChange={(e) => setRow(i, { include: e.target.checked })}
                    aria-label={`Include ${r.account || `debt ${i + 1}`} in weighted rate`}
                  />
                </td>
                <td className="rounded-l-lg px-2">
                  <TextInput value={r.account ?? ""} onChange={(e) => setRow(i, { account: e.target.value })} />
                </td>
                <td className="px-2">
                  <TextInput value={r.balance ?? ""} onChange={(e) => setRow(i, { balance: e.target.value })} />
                </td>
                <td className="px-2">
                  <TextInput value={r.ratePct ?? ""} onChange={(e) => setRow(i, { ratePct: e.target.value })} />
                </td>
                <td className="px-2">
                  <TextInput value={r.monthlyPayment ?? ""} onChange={(e) => setRow(i, { monthlyPayment: e.target.value })} />
                </td>
                <td className="px-2">
                  <TextInput value={r.note ?? ""} onChange={(e) => setRow(i, { note: e.target.value })} />
                </td>
                <td className="rounded-r-lg px-2 text-right">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      replaceData({
                        rows: rows.filter((_, idx) => idx !== i),
                      })
                    }
                  >
                    ×
                  </Button>
                </td>
              </tr>
            ))}
            <tr className="text-xs font-semibold text-foreground/90">
              <td className="px-3 text-center">
                {rows.filter((r) => r.include !== false).length}/{rows.length}
              </td>
              <td className="px-3">TOTALS</td>
              <td className="px-3">{formatUSD(totalBalance)}</td>
              <td className="px-3">{formatPct(weighted, 3)}</td>
              <td className="px-3">{formatUSD(totalMonthly)}</td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <Button
        variant="secondary"
        className="mt-3"
        onClick={() => replaceData({ rows: [...rows, {}] })}
      >
        + Add debt
      </Button>
    </SectionCard>
  );
}

export function WeightedInterestSection(props: SectionProps) {
  const instances = useMemo(
    () => normalizeWeightedInstances(props.draft),
    [props.draft]
  );
  return (
    <MultiInstanceToolShell
      singularLabel="Weighted interest"
      instances={instances}
      onInstancesChange={(next) =>
        props.update("weightedInterestInstances", next as never)
      }
      createEmptyData={() => ({ rows: [{}] })}
      embedChrome={props.analysisWorkspaceNested}
    >
      {(inst, replaceData) => (
        <WeightedInterestSectionCore
          draft={props.draft}
          data={inst.data as WeightedData}
          replaceData={replaceData}
        />
      )}
    </MultiInstanceToolShell>
  );
}

/* ============================== Payoff Calc ============================== */

function PayoffSectionCore({
  payoff,
  replacePayoff,
}: {
  payoff: PayoffData;
  replacePayoff: (next: PayoffData) => void;
}) {
  const p = payoff;
  function set<K extends keyof typeof p>(k: K, v: (typeof p)[K]) {
    replacePayoff({ ...p, [k]: v });
  }

  const fundingPrincipal = toNumber(p.fundingAmount);
  const rate = parseRate(p.annualRatePct);
  const years = toNumber(p.periodYears) || 30;
  const extra = toNumber(p.extraPayment);
  const start = p.startDate;

  const { rows, scheduledPayment, monthsOffLoan, totalInterest } = useMemo(
    () =>
      buildAmortization({
        fundingAmount: fundingPrincipal,
        annualRate: rate,
        periodYears: years,
        startDate: start,
        extraPayment: extra,
        maxRows: 600,
      }),
    [fundingPrincipal, rate, years, start, extra],
  );
  const scheduledTotal = scheduledPayment * years * 12;
  const withExtraTotal = rows.reduce((s, r) => s + r.totalPayment, 0);
  const interestSaved = (scheduledTotal - fundingPrincipal) - totalInterest;

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Payoff calculator" description="Shows how much faster the loan pays off with extra principal each month.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Funding amount ($)">
            <TextInput
              value={(p as { fundingAmount?: string }).fundingAmount ?? ""}
              onChange={(e) => set("fundingAmount", e.target.value)}
            />
          </Field>
          <Field label="Annual interest rate (%)">
            <TextInput value={p.annualRatePct ?? ""} onChange={(e) => set("annualRatePct", e.target.value)} />
          </Field>
          <Field label="Period (years)">
            <TextInput value={p.periodYears ?? ""} onChange={(e) => set("periodYears", e.target.value)} placeholder="30" />
          </Field>
          <Field label="Start date">
            <TextInput type="date" value={p.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field label="Extra monthly payment ($)">
            <TextInput value={p.extraPayment ?? ""} onChange={(e) => set("extraPayment", e.target.value)} />
          </Field>
          <Field label="Prepared for">
            <TextInput value={p.preparedFor ?? ""} onChange={(e) => set("preparedFor", e.target.value)} />
          </Field>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <ReadStat label="Scheduled payment" value={formatUSD(scheduledPayment, 2)} />
          <ReadStat label="Actual # of payments" value={String(rows.length)} />
          <ReadStat label="Months off loan" value={String(Math.max(0, monthsOffLoan))} highlight />
          <ReadStat label="Total interest paid" value={formatUSD(totalInterest)} />
          <ReadStat label="Total w/ extra" value={formatUSD(withExtraTotal)} />
          <ReadStat label="Interest saved" value={formatUSD(Math.max(0, interestSaved))} highlight />
        </div>
      </SectionCard>

      <SectionCard title="Amortization schedule" description={`Showing ${Math.min(rows.length, 360)} of ${rows.length} rows`}>
        <div className="max-h-[min(480px,55dvh)] max-w-full overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="sticky top-0 bg-muted/50 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2 text-right">Begin bal</th>
                <th className="px-2 py-2 text-right">Scheduled</th>
                <th className="px-2 py-2 text-right">Extra</th>
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-right">Principal</th>
                <th className="px-2 py-2 text-right">Interest</th>
                <th className="px-2 py-2 text-right">End bal</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 360).map((r) => (
                <tr key={r.idx} className="border-b border-border/80">
                  <td className="px-2 py-1.5 text-muted-foreground">{r.idx}</td>
                  <td className="px-2 py-1.5">{r.date}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatUSD(r.beginningBalance, 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatUSD(r.scheduledPayment, 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatUSD(r.extraPayment, 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatUSD(r.totalPayment, 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatUSD(r.principal, 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatUSD(r.interest, 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatUSD(r.endingBalance, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

export function PayoffSection(props: SectionProps) {
  const instances = useMemo(
    () => normalizePayoffInstances(props.draft),
    [props.draft]
  );
  return (
    <MultiInstanceToolShell
      singularLabel="Payoff calculation"
      instances={instances}
      onInstancesChange={(next) =>
        props.update("payoffInstances", next as never)
      }
      createEmptyData={() => ({ periodYears: "30" })}
      embedChrome={props.analysisWorkspaceNested}
    >
      {(inst, replaceData) => (
        <PayoffSectionCore
          payoff={inst.data as PayoffData}
          replacePayoff={replaceData}
        />
      )}
    </MultiInstanceToolShell>
  );
}

/* ============================== Day Counter ============================== */

function DayCounterSectionCore({
  dayCounter,
  replaceDayCounter,
}: {
  dayCounter: DayCounterData;
  replaceDayCounter: (next: DayCounterData) => void;
}) {
  const dc = dayCounter;
  function setPair(
    k: "noteDate" | "firstPaymentDate" | "additional",
    patch: Partial<NonNullable<typeof dc.noteDate>>,
  ) {
    const existing = dc[k] ?? {};
    replaceDayCounter({ ...dc, [k]: { ...existing, ...patch } });
  }

  const cards: Array<{ k: "noteDate" | "firstPaymentDate" | "additional"; title: string; caption: string }> = [
    { k: "noteDate", title: "From note date", caption: "VA 210-day seasoning requirement uses this gap." },
    { k: "firstPaymentDate", title: "From first payment date", caption: "Used for early payoff or season-of-loan math." },
    { k: "additional", title: "Additional calculator", caption: "General-purpose day counter." },
  ];

  return (
    <div className="flex flex-col gap-5">
      {cards.map(({ k, title, caption }) => {
        const pair = dc[k] ?? {};
        const total = daysBetween(pair.date1, pair.date2);
        return (
          <SectionCard key={k} title={title} description={caption}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Date 1">
                <TextInput type="date" value={pair.date1 ?? ""} onChange={(e) => setPair(k, { date1: e.target.value })} />
              </Field>
              <Field label="Date 2">
                <TextInput type="date" value={pair.date2 ?? ""} onChange={(e) => setPair(k, { date2: e.target.value })} />
              </Field>
              <ReadStat label="Total days" value={total === null ? "—" : String(total)} highlight />
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}

export function DayCounterSection(props: SectionProps) {
  const instances = useMemo(
    () => normalizeDayCounterInstances(props.draft),
    [props.draft]
  );
  return (
    <MultiInstanceToolShell
      singularLabel="Day counter"
      instances={instances}
      onInstancesChange={(next) =>
        props.update("dayCounterInstances", next as never)
      }
      createEmptyData={() => ({})}
      embedChrome={props.analysisWorkspaceNested}
    >
      {(inst, replaceData) => (
        <DayCounterSectionCore
          dayCounter={inst.data as DayCounterData}
          replaceDayCounter={replaceData}
        />
      )}
    </MultiInstanceToolShell>
  );
}

/* ============================== Helpers ============================== */

function ReadStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-md border px-3 py-2 ${
        highlight
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "border-border bg-muted/50 text-foreground"
      }`}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
