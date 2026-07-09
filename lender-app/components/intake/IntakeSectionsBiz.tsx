"use client";

import { useMemo } from "react";
import type { DealSectionProps } from "@/lib/file/dealSectionTypes";
import {
  formatPct,
  formatUSD,
  monthlyPayment,
  parseRate,
  toNumber,
} from "@/lib/intake/finance";
import { deriveIntake } from "@/lib/intake/derivations";
import {
  Button,
  Field,
  LinkedField,
  SectionCard,
  Select,
  TextArea,
  TextInput,
} from "./ui/Field";

export type SectionProps = DealSectionProps;

/* ============================== Business / Entity ============================== */

export function BusinessSection({ draft, update }: SectionProps) {
  const b = draft.business ?? {};
  const owners = b.owners ?? [];

  function set<K extends keyof typeof b>(k: K, val: (typeof b)[K]) {
    update("business", { ...b, [k]: val });
  }
  function setOwner(i: number, patch: Partial<(typeof owners)[number]>) {
    set("owners", owners.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  const yearsInBiz = useMemo(() => {
    if (!b.formationDate) return null;
    const d = new Date(b.formationDate);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const years = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    return years.toFixed(1);
  }, [b.formationDate]);

  const revenue = toNumber(b.annualRevenue);
  const monthly = toNumber(b.avgMonthlyDeposits);
  const estMonthly = revenue > 0 ? revenue / 12 : 0;
  const totalOwnership = owners.reduce((s, o) => s + toNumber(o.ownershipPct), 0);

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Entity" description="Legal identity of the borrowing business.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Legal entity name" className="sm:col-span-2">
            <TextInput value={b.legalName ?? ""} onChange={(e) => set("legalName", e.target.value)} />
          </Field>
          <Field label="DBA">
            <TextInput value={b.dba ?? ""} onChange={(e) => set("dba", e.target.value)} />
          </Field>
          <Field label="Entity type">
            <Select value={b.entityType ?? ""} onChange={(e) => set("entityType", e.target.value)}>
              <option value="">—</option>
              <option>Sole Proprietor</option>
              <option>General Partnership</option>
              <option>LP</option>
              <option>LLP</option>
              <option>LLC</option>
              <option>S-Corp</option>
              <option>C-Corp</option>
              <option>Non-Profit</option>
              <option>Trust</option>
            </Select>
          </Field>
          <Field label="EIN">
            <TextInput value={b.ein ?? ""} onChange={(e) => set("ein", e.target.value)} placeholder="XX-XXXXXXX" />
          </Field>
          <Field label="State of formation">
            <TextInput value={b.stateOfFormation ?? ""} onChange={(e) => set("stateOfFormation", e.target.value)} />
          </Field>
          <Field label="Formation date">
            <TextInput type="date" value={b.formationDate ?? ""} onChange={(e) => set("formationDate", e.target.value)} />
          </Field>
          <Field label="Years in business" hint={yearsInBiz ? `Auto: ${yearsInBiz} yrs` : undefined}>
            <TextInput placeholder={yearsInBiz ?? ""} value="" readOnly />
          </Field>
          <Field label="Industry">
            <TextInput value={b.industry ?? ""} onChange={(e) => set("industry", e.target.value)} />
          </Field>
          <Field label="NAICS code">
            <TextInput value={b.naics ?? ""} onChange={(e) => set("naics", e.target.value)} />
          </Field>
          <Field label="# Full-time employees">
            <TextInput value={b.employees ?? ""} onChange={(e) => set("employees", e.target.value)} />
          </Field>
          <Field label="Business address" className="sm:col-span-3">
            <TextInput value={b.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Phone">
            <TextInput value={b.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Website" className="sm:col-span-2">
            <TextInput value={b.website ?? ""} onChange={(e) => set("website", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Financials"
        description="Used for cash-flow underwriting, MCA stipulations, and SBA ratios."
        actions={
          <span className="text-sm text-muted-foreground">
            Avg deposits / mo: <strong>{formatUSD(monthly || estMonthly)}</strong>
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Annual revenue ($)">
            <TextInput value={b.annualRevenue ?? ""} onChange={(e) => set("annualRevenue", e.target.value)} />
          </Field>
          <Field label="Annual net profit ($)">
            <TextInput value={b.annualNetProfit ?? ""} onChange={(e) => set("annualNetProfit", e.target.value)} />
          </Field>
          <Field label="Avg monthly bank deposits ($)" hint={estMonthly ? `Rev/12 ≈ ${formatUSD(estMonthly)}` : undefined}>
            <TextInput value={b.avgMonthlyDeposits ?? ""} onChange={(e) => set("avgMonthlyDeposits", e.target.value)} />
          </Field>
          <Field label="Monthly NSFs / negatives">
            <TextInput value={b.monthlyNSF ?? ""} onChange={(e) => set("monthlyNSF", e.target.value)} />
          </Field>
          <Field label="Monthly card volume ($)">
            <TextInput value={b.monthlyCardVolume ?? ""} onChange={(e) => set("monthlyCardVolume", e.target.value)} />
          </Field>
          <Field label="Personal guarantee required">
            <Select value={b.personalGuaranteeRequired ?? ""} onChange={(e) => set("personalGuaranteeRequired", e.target.value)}>
              <option value="">—</option>
              <option>Yes</option>
              <option>No</option>
            </Select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Business credit">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Paynet score">
            <TextInput value={b.paynet ?? ""} onChange={(e) => set("paynet", e.target.value)} />
          </Field>
          <Field label="D&B PAYDEX">
            <TextInput value={b.dnbScore ?? ""} onChange={(e) => set("dnbScore", e.target.value)} />
          </Field>
          <Field label="Experian Intelliscore">
            <TextInput value={b.experianIntelliScore ?? ""} onChange={(e) => set("experianIntelliScore", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Existing MCAs / business debt" description="Critical for stacking rules.">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Has existing MCA?">
            <Select value={b.hasExistingMCA ?? ""} onChange={(e) => set("hasExistingMCA", e.target.value)}>
              <option value="">—</option>
              <option>No</option>
              <option>Yes</option>
            </Select>
          </Field>
          <Field label="# MCAs active">
            <TextInput value={b.existingMCACount ?? ""} onChange={(e) => set("existingMCACount", e.target.value)} />
          </Field>
          <Field label="MCA balance ($)">
            <TextInput value={b.existingMCABalance ?? ""} onChange={(e) => set("existingMCABalance", e.target.value)} />
          </Field>
          <Field label="Payments / month">
            <TextInput value={b.mcaPaymentsPerMonth ?? ""} onChange={(e) => set("mcaPaymentsPerMonth", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Financing request">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Funding product">
            <Select value={b.fundingProduct ?? ""} onChange={(e) => set("fundingProduct", e.target.value)}>
              <option value="">—</option>
              <option>MCA / Revenue Based</option>
              <option>Term Loan</option>
              <option>Line of Credit</option>
              <option>SBA 7(a)</option>
              <option>SBA 504</option>
              <option>Equipment Financing</option>
              <option>Invoice Factoring / AR</option>
              <option>Purchase Order Financing</option>
              <option>Asset-Based Loan</option>
            </Select>
          </Field>
          <Field label="Requested amount ($)">
            <TextInput value={b.requestedAmount ?? ""} onChange={(e) => set("requestedAmount", e.target.value)} />
          </Field>
          <Field label="Requested term (months)">
            <TextInput value={b.requestedTermMonths ?? ""} onChange={(e) => set("requestedTermMonths", e.target.value)} />
          </Field>
          <Field label="Use of funds (category)">
            <Select value={b.useOfFunds ?? ""} onChange={(e) => set("useOfFunds", e.target.value)}>
              <option value="">—</option>
              <option>Working Capital</option>
              <option>Expansion</option>
              <option>Equipment Purchase</option>
              <option>Inventory</option>
              <option>Payroll</option>
              <option>Debt Consolidation</option>
              <option>Marketing</option>
              <option>Business Acquisition</option>
              <option>Partner Buy-Out</option>
              <option>Real Estate</option>
            </Select>
          </Field>
          <Field label="Use of funds — detail" className="sm:col-span-2">
            <TextInput value={b.useOfFundsNotes ?? ""} onChange={(e) => set("useOfFundsNotes", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Owners & key principals"
        description="List every owner at ≥ 20% for most lenders; SBA / bank loans require 100% coverage."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Ownership covered: <strong>{totalOwnership.toFixed(2)}%</strong>
            </span>
            <Button variant="secondary" onClick={() => set("owners", [...owners, { title: "Member" }])}>+ Owner</Button>
          </div>
        }
      >
        <div className="max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3">Name</th>
                <th className="px-3">Title</th>
                <th className="px-3">Ownership %</th>
                <th className="px-3">SSN</th>
                <th className="px-3">FICO</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {owners.map((o, i) => (
                <tr key={i} className="bg-muted/50">
                  <td className="rounded-l-lg px-2">
                    <TextInput value={o.name ?? ""} onChange={(e) => setOwner(i, { name: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput value={o.title ?? ""} onChange={(e) => setOwner(i, { title: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput value={o.ownershipPct ?? ""} onChange={(e) => setOwner(i, { ownershipPct: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput value={o.ssn ?? ""} onChange={(e) => setOwner(i, { ssn: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput value={o.fico ?? ""} onChange={(e) => setOwner(i, { fico: e.target.value })} />
                  </td>
                  <td className="rounded-r-lg px-2 text-right">
                    <Button variant="ghost" onClick={() => set("owners", owners.filter((_, idx) => idx !== i))}>×</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Notes">
        <TextArea value={b.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </SectionCard>
    </div>
  );
}

/* ============================ Commercial / DSCR ============================ */

export function CommercialSection({ draft, update }: SectionProps) {
  const c = draft.commercial ?? {};
  const di = deriveIntake(draft);

  function set<K extends keyof typeof c>(k: K, val: (typeof c)[K]) {
    update("commercial", { ...c, [k]: val });
  }

  const gsr = toNumber(c.grossScheduledRent);
  const vacancyPct = parseRate(c.vacancyPct);
  const vacancyLoss = gsr * vacancyPct;
  const other = toNumber(c.otherIncome);
  const gpi = gsr - vacancyLoss + other;
  const opEx =
    toNumber(c.opExTaxes) +
    toNumber(c.opExInsurance) +
    toNumber(c.opExManagement) +
    toNumber(c.opExRepairs) +
    toNumber(c.opExUtilities) +
    toNumber(c.opExOther);
  const noi = gpi - opEx;

  const cAny = c as { fundingAmount?: string };
  const loan =
    toNumber(cAny.fundingAmount) || toNumber(di.proposedLoanAmount);
  const rate = parseRate(c.ratePct);
  const amYears = toNumber(c.amortizationYears) || 30;
  const debtServiceMonthly = monthlyPayment(loan, rate, amYears * 12);
  const debtServiceAnnual = debtServiceMonthly * 12;
  const dscr = debtServiceAnnual > 0 ? noi / debtServiceAnnual : 0;

  const pv = toNumber(di.subjectValue);
  const capRate = pv > 0 ? noi / pv : 0;
  const ltv = pv > 0 ? loan / pv : 0;

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Property classification">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Property class">
            <Select value={c.propertyClass ?? ""} onChange={(e) => set("propertyClass", e.target.value)}>
              <option value="">—</option>
              <option>A</option>
              <option>B</option>
              <option>C</option>
              <option>D</option>
            </Select>
          </Field>
          <Field label="Sub-type">
            <Select value={c.propertySubType ?? ""} onChange={(e) => set("propertySubType", e.target.value)}>
              <option value="">—</option>
              <option>Multifamily 5+ Units</option>
              <option>Mixed Use</option>
              <option>Retail</option>
              <option>Office</option>
              <option>Industrial / Warehouse</option>
              <option>Hospitality</option>
              <option>Self-Storage</option>
              <option>Manufactured Housing Community</option>
              <option>Medical Office</option>
              <option>Special Purpose</option>
              <option>Land / Development</option>
            </Select>
          </Field>
          <Field label="# Units">
            <TextInput value={c.units ?? ""} onChange={(e) => set("units", e.target.value)} />
          </Field>
          <Field label="Rentable sq ft">
            <TextInput value={c.rentableSqFt ?? ""} onChange={(e) => set("rentableSqFt", e.target.value)} />
          </Field>
          <Field label="Year built">
            <TextInput value={c.yearBuilt ?? ""} onChange={(e) => set("yearBuilt", e.target.value)} />
          </Field>
          <Field label="Year renovated">
            <TextInput value={c.yearRenovated ?? ""} onChange={(e) => set("yearRenovated", e.target.value)} />
          </Field>
          <Field label="Occupancy %">
            <TextInput value={c.occupancyPct ?? ""} onChange={(e) => set("occupancyPct", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Rent roll summary"
        description="Annual figures. Move to a full rent-roll attachment for any 5+ unit or mixed-use."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Gross scheduled rent (annual)">
            <TextInput value={c.grossScheduledRent ?? ""} onChange={(e) => set("grossScheduledRent", e.target.value)} />
          </Field>
          <Field label="Vacancy % (e.g. 5%)">
            <TextInput value={c.vacancyPct ?? ""} onChange={(e) => set("vacancyPct", e.target.value)} />
          </Field>
          <Field label="Other income (annual)">
            <TextInput value={c.otherIncome ?? ""} onChange={(e) => set("otherIncome", e.target.value)} />
          </Field>
          <ReadStat label="Vacancy loss" value={formatUSD(vacancyLoss)} />
          <ReadStat label="Gross operating income" value={formatUSD(gpi)} />
        </div>
      </SectionCard>

      <SectionCard title="Operating expenses (annual)">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Property taxes">
            <TextInput value={c.opExTaxes ?? ""} onChange={(e) => set("opExTaxes", e.target.value)} />
          </Field>
          <Field label="Insurance">
            <TextInput value={c.opExInsurance ?? ""} onChange={(e) => set("opExInsurance", e.target.value)} />
          </Field>
          <Field label="Management">
            <TextInput value={c.opExManagement ?? ""} onChange={(e) => set("opExManagement", e.target.value)} />
          </Field>
          <Field label="Repairs & maintenance">
            <TextInput value={c.opExRepairs ?? ""} onChange={(e) => set("opExRepairs", e.target.value)} />
          </Field>
          <Field label="Utilities">
            <TextInput value={c.opExUtilities ?? ""} onChange={(e) => set("opExUtilities", e.target.value)} />
          </Field>
          <Field label="Other">
            <TextInput value={c.opExOther ?? ""} onChange={(e) => set("opExOther", e.target.value)} />
          </Field>
          <ReadStat label="Total OpEx" value={formatUSD(opEx)} />
          <ReadStat label="NOI" value={formatUSD(noi)} highlight />
          <ReadStat label="Cap rate (at value)" value={formatPct(capRate, 2)} />
        </div>
      </SectionCard>

      <SectionCard
        title="Commercial loan terms"
        actions={
          <span className="text-sm text-muted-foreground">
            DSCR: <strong>{dscr ? dscr.toFixed(2) + "x" : "—"}</strong> · LTV: <strong>{pv > 0 ? formatPct(ltv, 2) : "—"}</strong>
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <LinkedField
            label="Funding amount ($)"
            value={cAny.fundingAmount ?? ""}
            linkedValue={di.proposedLoanAmount}
            linkedFrom="Scenario"
            onChange={(v) => set("fundingAmount", v)}
          />
          <Field label="Rate (%)">
            <TextInput value={c.ratePct ?? ""} onChange={(e) => set("ratePct", e.target.value)} />
          </Field>
          <Field label="Amortization (years)">
            <TextInput value={c.amortizationYears ?? ""} onChange={(e) => set("amortizationYears", e.target.value)} placeholder="30" />
          </Field>
          <Field label="Term (months)">
            <TextInput value={c.termMonths ?? ""} onChange={(e) => set("termMonths", e.target.value)} placeholder="60 / 84 / 120" />
          </Field>
          <Field label="Recourse">
            <Select value={c.recourse ?? ""} onChange={(e) => set("recourse", e.target.value)}>
              <option value="">—</option>
              <option>Full Recourse</option>
              <option>Limited Recourse</option>
              <option>Non-Recourse</option>
              <option>Non-Recourse w/ Bad-Boy Carve-Outs</option>
            </Select>
          </Field>
          <Field label="Prepay structure">
            <Select value={c.prepayStructure ?? ""} onChange={(e) => set("prepayStructure", e.target.value)}>
              <option value="">—</option>
              <option>None</option>
              <option>Step-Down (5/4/3/2/1)</option>
              <option>Step-Down (3/2/1)</option>
              <option>Yield Maintenance</option>
              <option>Defeasance</option>
              <option>Lockout + Open</option>
            </Select>
          </Field>
          <ReadStat label="Monthly debt service" value={formatUSD(debtServiceMonthly, 2)} />
          <ReadStat label="Annual debt service" value={formatUSD(debtServiceAnnual)} />
          <ReadStat label="DSCR" value={dscr ? `${dscr.toFixed(2)}x` : "—"} highlight />
        </div>
      </SectionCard>

      <SectionCard title="Sponsor & exit">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sponsor liquidity ($)">
            <TextInput value={c.sponsorLiquidity ?? ""} onChange={(e) => set("sponsorLiquidity", e.target.value)} />
          </Field>
          <Field label="Sponsor net worth ($)">
            <TextInput value={c.sponsorNetWorth ?? ""} onChange={(e) => set("sponsorNetWorth", e.target.value)} />
          </Field>
          <Field label="Exit strategy">
            <Select value={c.exitStrategy ?? ""} onChange={(e) => set("exitStrategy", e.target.value)}>
              <option value="">—</option>
              <option>Long-term hold</option>
              <option>Sell / Disposition</option>
              <option>Refinance into agency / perm</option>
              <option>Lease-up then refi</option>
              <option>Repositioning / value-add</option>
            </Select>
          </Field>
          <Field label="Notes" className="sm:col-span-3">
            <TextArea value={c.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

/* ============================== Hard Money ============================== */

export function HardMoneySection({ draft, update }: SectionProps) {
  const h = draft.hardMoney ?? {};
  const lines = h.rehabLines ?? [];
  const di = deriveIntake(draft);

  function set<K extends keyof typeof h>(k: K, val: (typeof h)[K]) {
    update("hardMoney", { ...h, [k]: val });
  }
  function setLine(i: number, patch: Partial<(typeof lines)[number]>) {
    set("rehabLines", lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const purchase = toNumber(h.purchasePrice);
  const rehabBudget = toNumber(h.rehabBudget);
  const linesTotal = lines.reduce((s, l) => s + toNumber(l.amount), 0);
  const rehabEffective = rehabBudget || linesTotal;

  const asIs = toNumber(h.asIsValue) || toNumber(di.subjectValue);
  const arv = toNumber(h.arv);

  const initialLoan = toNumber(h.initialLoan);
  const holdback = toNumber(h.rehabHoldback);
  const totalLoan = initialLoan + holdback;

  const totalCost = purchase + rehabEffective;
  const ltc = totalCost > 0 ? totalLoan / totalCost : 0;
  const ltv = asIs > 0 ? initialLoan / asIs : 0;
  const ltarv = arv > 0 ? totalLoan / arv : 0;

  const rate = parseRate(h.ratePct);
  const ioMonthly = initialLoan * (rate / 12);
  const points = parseRate(h.points);
  const pointsDollars = totalLoan * points;
  const term = toNumber(h.termMonths) || 12;
  const holdMonths = toNumber(h.projectedHoldMonths) || term;

  const projectedSale = toNumber(h.projectedSale);
  const sellingCostsPct = parseRate(h.sellingCostsPct);
  const sellingCosts = projectedSale * sellingCostsPct;
  const holdingCost = toNumber(h.monthlyHoldingCosts) * holdMonths + ioMonthly * holdMonths;
  const totalOut = purchase + rehabEffective + pointsDollars + holdingCost;
  const projectedProfit = projectedSale - sellingCosts - totalOut;

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Deal structure"
        description="Covers bridge, fix-and-flip, ground-up construction, and short-term rental loans."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Product">
            <Select value={h.product ?? ""} onChange={(e) => set("product", e.target.value)}>
              <option value="">—</option>
              <option>Fix & Flip</option>
              <option>Bridge (residential)</option>
              <option>Bridge (commercial)</option>
              <option>Ground-Up Construction</option>
              <option>DSCR / Long-Term Rental</option>
              <option>STR (short-term rental)</option>
              <option>Land</option>
              <option>Cash-Out Refi (HML)</option>
            </Select>
          </Field>
          <Field label="Rehab scope">
            <Select value={h.rehabScope ?? ""} onChange={(e) => set("rehabScope", e.target.value)}>
              <option value="">—</option>
              <option>Light (cosmetic)</option>
              <option>Moderate</option>
              <option>Heavy / Gut</option>
              <option>Ground-Up</option>
            </Select>
          </Field>
          <Field label="Exit strategy">
            <Select value={h.exitStrategy ?? ""} onChange={(e) => set("exitStrategy", e.target.value)}>
              <option value="">—</option>
              <option>Sell (flip)</option>
              <option>Refi into DSCR</option>
              <option>Refi into conventional</option>
              <option>Lease & hold</option>
              <option>Owner occupy</option>
            </Select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Values & loan sizing"
        actions={
          <span className="text-sm text-muted-foreground">
            LTC <strong>{formatPct(ltc, 1)}</strong> · LTV <strong>{formatPct(ltv, 1)}</strong> · LTARV <strong>{formatPct(ltarv, 1)}</strong>
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Purchase price ($)">
            <TextInput value={h.purchasePrice ?? ""} onChange={(e) => set("purchasePrice", e.target.value)} />
          </Field>
          <Field label="Rehab budget ($)" hint={linesTotal > 0 ? `Line items sum to ${formatUSD(linesTotal)}` : undefined}>
            <TextInput value={h.rehabBudget ?? ""} onChange={(e) => set("rehabBudget", e.target.value)} placeholder={linesTotal > 0 ? String(linesTotal) : ""} />
          </Field>
          <ReadStat label="Total project cost" value={formatUSD(totalCost)} />
          <LinkedField
            label="As-is value ($)"
            value={h.asIsValue ?? ""}
            linkedValue={di.subjectValue}
            linkedFrom="Intake: Property"
            onChange={(v) => set("asIsValue", v)}
          />
          <Field label="ARV ($)">
            <TextInput value={h.arv ?? ""} onChange={(e) => set("arv", e.target.value)} />
          </Field>
          <Field label="Initial loan at close ($)">
            <TextInput value={h.initialLoan ?? ""} onChange={(e) => set("initialLoan", e.target.value)} />
          </Field>
          <Field label="Rehab holdback ($)">
            <TextInput value={h.rehabHoldback ?? ""} onChange={(e) => set("rehabHoldback", e.target.value)} />
          </Field>
          <ReadStat label="Total loan commitment" value={formatUSD(totalLoan)} highlight />
          <ReadStat label="I/O monthly (on initial)" value={formatUSD(ioMonthly, 2)} />
        </div>
      </SectionCard>

      <SectionCard title="Pricing & terms">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Rate (%)">
            <TextInput value={h.ratePct ?? ""} onChange={(e) => set("ratePct", e.target.value)} />
          </Field>
          <Field label="Points (%)">
            <TextInput value={h.points ?? ""} onChange={(e) => set("points", e.target.value)} />
          </Field>
          <ReadStat label="Points $" value={formatUSD(pointsDollars, 2)} />
          <Field label="Term (months)">
            <TextInput value={h.termMonths ?? ""} onChange={(e) => set("termMonths", e.target.value)} placeholder="12" />
          </Field>
          <Field label="Prepay penalty">
            <Select value={h.prepayPenalty ?? ""} onChange={(e) => set("prepayPenalty", e.target.value)}>
              <option value="">—</option>
              <option>None</option>
              <option>3-month minimum interest</option>
              <option>6-month minimum interest</option>
              <option>Step-down</option>
              <option>Custom</option>
            </Select>
          </Field>
          <Field label="Exit / back-end fee ($ or %)">
            <TextInput value={h.exitFee ?? ""} onChange={(e) => set("exitFee", e.target.value)} />
          </Field>
          <Field label="Extension available (months)">
            <TextInput value={h.extensionMonths ?? ""} onChange={(e) => set("extensionMonths", e.target.value)} />
          </Field>
          <Field label="Extension fee (%)">
            <TextInput value={h.extensionFee ?? ""} onChange={(e) => set("extensionFee", e.target.value)} />
          </Field>
          <Field label="Interest reserve (months)">
            <TextInput value={h.interestReserveMonths ?? ""} onChange={(e) => set("interestReserveMonths", e.target.value)} />
          </Field>
          <Field label="Draw fee ($)">
            <TextInput value={h.drawFee ?? ""} onChange={(e) => set("drawFee", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Rehab budget — line items"
        description="Optional detailed scope. Line totals can override the budget field above."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Lines total: <strong>{formatUSD(linesTotal)}</strong>
            </span>
            <Button variant="secondary" onClick={() => set("rehabLines", [...lines, {}])}>+ Line</Button>
          </div>
        }
      >
        <div className="max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3">Category</th>
                <th className="px-3">Description</th>
                <th className="px-3">Amount</th>
                <th className="px-3">Draw #</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="bg-muted/50">
                  <td className="rounded-l-lg px-2">
                    <TextInput value={l.category ?? ""} onChange={(e) => setLine(i, { category: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput value={l.description ?? ""} onChange={(e) => setLine(i, { description: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput value={l.amount ?? ""} onChange={(e) => setLine(i, { amount: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput value={l.draw ?? ""} onChange={(e) => setLine(i, { draw: e.target.value })} />
                  </td>
                  <td className="rounded-r-lg px-2 text-right">
                    <Button variant="ghost" onClick={() => set("rehabLines", lines.filter((_, idx) => idx !== i))}>×</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Exit & profit model"
        actions={
          <span className="text-sm text-muted-foreground">
            Est. profit: <strong className={projectedProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{formatUSD(projectedProfit)}</strong>
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Projected sale price ($)">
            <TextInput value={h.projectedSale ?? ""} onChange={(e) => set("projectedSale", e.target.value)} />
          </Field>
          <Field label="Projected hold (months)">
            <TextInput value={h.projectedHoldMonths ?? ""} onChange={(e) => set("projectedHoldMonths", e.target.value)} />
          </Field>
          <Field label="Selling costs % (commission, closing)">
            <TextInput value={h.sellingCostsPct ?? ""} onChange={(e) => set("sellingCostsPct", e.target.value)} />
          </Field>
          <Field label="Monthly holding cost ($)">
            <TextInput value={h.monthlyHoldingCosts ?? ""} onChange={(e) => set("monthlyHoldingCosts", e.target.value)} />
          </Field>
          <ReadStat label="Total cash out" value={formatUSD(totalOut)} />
          <ReadStat label="Selling costs" value={formatUSD(sellingCosts)} />
        </div>
      </SectionCard>

      <SectionCard title="Sponsor track record">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Flips completed (last 24 mo)">
            <TextInput value={h.experienceFlips24 ?? ""} onChange={(e) => set("experienceFlips24", e.target.value)} />
          </Field>
          <Field label="Flips completed (last 36 mo)">
            <TextInput value={h.experienceFlips36 ?? ""} onChange={(e) => set("experienceFlips36", e.target.value)} />
          </Field>
          <Field label="Rentals currently owned">
            <TextInput value={h.rentalsOwned ?? ""} onChange={(e) => set("rentalsOwned", e.target.value)} />
          </Field>
          <Field label="Lifetime volume ($)">
            <TextInput value={h.volumeLifetime ?? ""} onChange={(e) => set("volumeLifetime", e.target.value)} />
          </Field>
          <Field label="Notes" className="sm:col-span-4">
            <TextArea value={h.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

/* ============================== Guarantors ============================== */

export function GuarantorsSection({ draft, update }: SectionProps) {
  const items = draft.guarantors ?? [];

  function setItem(i: number, patch: Partial<(typeof items)[number]>) {
    update("guarantors", items.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }

  const liquidTotal = items.reduce((s, g) => s + toNumber(g.liquidAssets), 0);
  const nwTotal = items.reduce((s, g) => s + toNumber(g.netWorth), 0);

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Guarantors & sponsors"
        description="For commercial, entity, and hard money loans — document every person signing a PG or with sponsor-level experience."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Combined liquid: <strong>{formatUSD(liquidTotal)}</strong> · Net worth: <strong>{formatUSD(nwTotal)}</strong>
            </span>
            <Button variant="secondary" onClick={() => update("guarantors", [...items, { role: "Secondary" }])}>
              + Guarantor
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {items.map((g, i) => (
            <div key={i} className="rounded-xl border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Guarantor {i + 1} {g.role ? `· ${g.role}` : ""}
                </h3>
                <Button variant="ghost" onClick={() => update("guarantors", items.filter((_, idx) => idx !== i))}>
                  Remove
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Full name">
                  <TextInput value={g.name ?? ""} onChange={(e) => setItem(i, { name: e.target.value })} />
                </Field>
                <Field label="Role">
                  <Select value={g.role ?? ""} onChange={(e) => setItem(i, { role: e.target.value })}>
                    <option value="">—</option>
                    <option>Primary</option>
                    <option>Secondary</option>
                    <option>Sponsor</option>
                    <option>Key Principal</option>
                    <option>Non-Occupant Guarantor</option>
                    <option>Corporate Guarantor</option>
                  </Select>
                </Field>
                <Field label="Ownership %">
                  <TextInput value={g.ownershipPct ?? ""} onChange={(e) => setItem(i, { ownershipPct: e.target.value })} />
                </Field>
                <Field label="FICO">
                  <TextInput value={g.fico ?? ""} onChange={(e) => setItem(i, { fico: e.target.value })} />
                </Field>
                <Field label="Liquid assets ($)">
                  <TextInput value={g.liquidAssets ?? ""} onChange={(e) => setItem(i, { liquidAssets: e.target.value })} />
                </Field>
                <Field label="Net worth ($)">
                  <TextInput value={g.netWorth ?? ""} onChange={(e) => setItem(i, { netWorth: e.target.value })} />
                </Field>
                <Field label="Years experience">
                  <TextInput value={g.yearsExperience ?? ""} onChange={(e) => setItem(i, { yearsExperience: e.target.value })} />
                </Field>
                <Field label="SSN">
                  <TextInput value={g.ssn ?? ""} onChange={(e) => setItem(i, { ssn: e.target.value })} />
                </Field>
                <Field label="DOB">
                  <TextInput type="date" value={g.dob ?? ""} onChange={(e) => setItem(i, { dob: e.target.value })} />
                </Field>
                <Field label="Mobile">
                  <TextInput value={g.mobile ?? ""} onChange={(e) => setItem(i, { mobile: e.target.value })} />
                </Field>
                <Field label="Email">
                  <TextInput type="email" value={g.email ?? ""} onChange={(e) => setItem(i, { email: e.target.value })} />
                </Field>
                <Field label="Citizenship">
                  <Select value={g.citizenship ?? ""} onChange={(e) => setItem(i, { citizenship: e.target.value })}>
                    <option value="">—</option>
                    <option>US Citizen</option>
                    <option>Permanent Resident</option>
                    <option>Foreign National</option>
                    <option>ITIN</option>
                  </Select>
                </Field>
                <Field label="Residence address" className="sm:col-span-3">
                  <TextInput value={g.address ?? ""} onChange={(e) => setItem(i, { address: e.target.value })} />
                </Field>
                <Field label="Notes" className="sm:col-span-3">
                  <TextArea value={g.notes ?? ""} onChange={(e) => setItem(i, { notes: e.target.value })} />
                </Field>
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guarantors yet.</p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

/* ============================== Fees & Closing ============================== */

export function FeesSection({ draft, update }: SectionProps) {
  const f = draft.fees ?? {};
  const broker = f.broker ?? {};
  const lender = f.lender ?? {};
  const tp = f.thirdParty ?? {};
  const pp = f.prepaids ?? {};
  const di = deriveIntake(draft);

  function setFees(patch: Partial<typeof f>) {
    update("fees", { ...f, ...patch });
  }

  const brokerSum =
    toNumber(broker.origination) +
    toNumber(broker.processing) +
    toNumber(broker.underwriting) +
    toNumber(broker.flatFee);

  const coverAny = draft.cover as { fundingAmount?: string } | undefined;
  const fundingAmount =
    toNumber(coverAny?.fundingAmount) ||
    toNumber(di.proposedLoanAmount) ||
    toNumber(draft.hardMoney?.initialLoan) +
      toNumber(draft.hardMoney?.rehabHoldback);

  const lenderPointsPct = parseRate(lender.pointsPct);
  const lenderPointsDollars = fundingAmount * lenderPointsPct;

  const lenderSum =
    toNumber(lender.origination) +
    toNumber(lender.discount) +
    toNumber(lender.underwriting) +
    toNumber(lender.processing) +
    toNumber(lender.docPrep) +
    toNumber(lender.admin) +
    toNumber(lender.funding) +
    lenderPointsDollars;

  const tpSum =
    toNumber(tp.appraisal) +
    toNumber(tp.environmental) +
    toNumber(tp.inspection) +
    toNumber(tp.titleInsurance) +
    toNumber(tp.escrow) +
    toNumber(tp.recording) +
    toNumber(tp.legal) +
    toNumber(tp.survey);

  const ppSum =
    toNumber(pp.taxReserve) +
    toNumber(pp.insuranceReserve) +
    toNumber(pp.hoa);

  const total = brokerSum + lenderSum + tpSum + ppSum + toNumber(f.wireFee) - toNumber(f.creditsToBorrower);

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Broker fees"
        description="Your compensation paid at close (in addition to any lender-paid comp from the Cover tab)."
        actions={<strong className="text-sm">{formatUSD(brokerSum)}</strong>}
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Origination ($)">
            <TextInput value={broker.origination ?? ""} onChange={(e) => setFees({ broker: { ...broker, origination: e.target.value } })} />
          </Field>
          <Field label="Processing ($)">
            <TextInput value={broker.processing ?? ""} onChange={(e) => setFees({ broker: { ...broker, processing: e.target.value } })} />
          </Field>
          <Field label="Underwriting ($)">
            <TextInput value={broker.underwriting ?? ""} onChange={(e) => setFees({ broker: { ...broker, underwriting: e.target.value } })} />
          </Field>
          <Field label="Flat broker fee ($)">
            <TextInput value={broker.flatFee ?? ""} onChange={(e) => setFees({ broker: { ...broker, flatFee: e.target.value } })} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Lender fees"
        description="Fees charged directly by the lender."
        actions={<strong className="text-sm">{formatUSD(lenderSum)}</strong>}
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Origination ($)">
            <TextInput value={lender.origination ?? ""} onChange={(e) => setFees({ lender: { ...lender, origination: e.target.value } })} />
          </Field>
          <Field label="Discount ($)">
            <TextInput value={lender.discount ?? ""} onChange={(e) => setFees({ lender: { ...lender, discount: e.target.value } })} />
          </Field>
          <Field label="Underwriting ($)">
            <TextInput value={lender.underwriting ?? ""} onChange={(e) => setFees({ lender: { ...lender, underwriting: e.target.value } })} />
          </Field>
          <Field label="Processing ($)">
            <TextInput value={lender.processing ?? ""} onChange={(e) => setFees({ lender: { ...lender, processing: e.target.value } })} />
          </Field>
          <Field label="Doc prep ($)">
            <TextInput value={lender.docPrep ?? ""} onChange={(e) => setFees({ lender: { ...lender, docPrep: e.target.value } })} />
          </Field>
          <Field label="Admin ($)">
            <TextInput value={lender.admin ?? ""} onChange={(e) => setFees({ lender: { ...lender, admin: e.target.value } })} />
          </Field>
          <Field label="Funding ($)">
            <TextInput value={lender.funding ?? ""} onChange={(e) => setFees({ lender: { ...lender, funding: e.target.value } })} />
          </Field>
          <Field
            label="Points (%)"
            hint={fundingAmount > 0 ? `On ${formatUSD(fundingAmount)} = ${formatUSD(lenderPointsDollars, 2)}` : undefined}
          >
            <TextInput value={lender.pointsPct ?? ""} onChange={(e) => setFees({ lender: { ...lender, pointsPct: e.target.value } })} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Third-party"
        description="Typically ordered by the broker / lender but paid out to outside vendors."
        actions={<strong className="text-sm">{formatUSD(tpSum)}</strong>}
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Appraisal ($)">
            <TextInput value={tp.appraisal ?? ""} onChange={(e) => setFees({ thirdParty: { ...tp, appraisal: e.target.value } })} />
          </Field>
          <Field label="Environmental (Phase I) ($)">
            <TextInput value={tp.environmental ?? ""} onChange={(e) => setFees({ thirdParty: { ...tp, environmental: e.target.value } })} />
          </Field>
          <Field label="Inspection / feasibility ($)">
            <TextInput value={tp.inspection ?? ""} onChange={(e) => setFees({ thirdParty: { ...tp, inspection: e.target.value } })} />
          </Field>
          <Field label="Title insurance ($)">
            <TextInput value={tp.titleInsurance ?? ""} onChange={(e) => setFees({ thirdParty: { ...tp, titleInsurance: e.target.value } })} />
          </Field>
          <Field label="Escrow / settlement ($)">
            <TextInput value={tp.escrow ?? ""} onChange={(e) => setFees({ thirdParty: { ...tp, escrow: e.target.value } })} />
          </Field>
          <Field label="Recording ($)">
            <TextInput value={tp.recording ?? ""} onChange={(e) => setFees({ thirdParty: { ...tp, recording: e.target.value } })} />
          </Field>
          <Field label="Legal ($)">
            <TextInput value={tp.legal ?? ""} onChange={(e) => setFees({ thirdParty: { ...tp, legal: e.target.value } })} />
          </Field>
          <Field label="Survey ($)">
            <TextInput value={tp.survey ?? ""} onChange={(e) => setFees({ thirdParty: { ...tp, survey: e.target.value } })} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Prepaids & reserves"
        actions={<strong className="text-sm">{formatUSD(ppSum)}</strong>}
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Per-diem interest days">
            <TextInput value={pp.perDiemDays ?? ""} onChange={(e) => setFees({ prepaids: { ...pp, perDiemDays: e.target.value } })} />
          </Field>
          <Field label="Property tax reserve ($)">
            <TextInput value={pp.taxReserve ?? ""} onChange={(e) => setFees({ prepaids: { ...pp, taxReserve: e.target.value } })} />
          </Field>
          <Field label="Insurance reserve ($)">
            <TextInput value={pp.insuranceReserve ?? ""} onChange={(e) => setFees({ prepaids: { ...pp, insuranceReserve: e.target.value } })} />
          </Field>
          <Field label="HOA ($)">
            <TextInput value={pp.hoa ?? ""} onChange={(e) => setFees({ prepaids: { ...pp, hoa: e.target.value } })} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Adjustments & totals">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Wire / courier fee ($)">
            <TextInput value={f.wireFee ?? ""} onChange={(e) => setFees({ wireFee: e.target.value })} />
          </Field>
          <Field label="Credits to borrower ($)" hint="Lender credit, seller credit, broker rebate">
            <TextInput value={f.creditsToBorrower ?? ""} onChange={(e) => setFees({ creditsToBorrower: e.target.value })} />
          </Field>
          <ReadStat label="TOTAL estimated fees" value={formatUSD(total)} highlight />
          <Field label="Notes" className="sm:col-span-3">
            <TextArea value={f.notes ?? ""} onChange={(e) => setFees({ notes: e.target.value })} />
          </Field>
        </div>
      </SectionCard>
    </div>
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
