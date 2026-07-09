import type { Doc } from "@/convex/_generated/dataModel";
import { downloadBlob } from "@/lib/export/downloadClient";

export type Sheet = Doc<"intakeSheets">;

/* ============================== Generic helpers ============================== */

function slugify(s: string) {
  return s
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function fileBase(sheet: Sheet) {
  const name =
    sheet.borrowers?.[0]?.lastName ||
    sheet.borrowers?.[0]?.firstName ||
    sheet.leadId ||
    "intake";
  return slugify(`${name}-${new Date().toISOString().slice(0, 10)}`);
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function isScalar(v: unknown): v is string | number | boolean {
  const t = typeof v;
  return t === "string" || t === "number" || t === "boolean";
}

/* ============================== Section view-model ============================== */

type Row = { label: string; value: string };
type Table = { columns: string[]; rows: (string | number | boolean | null | undefined)[][] };
type Block = { title: string; rows?: Row[]; table?: Table };
type Section = { id: string; name: string; blocks: Block[] };

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (isScalar(value)) return String(value);
  return JSON.stringify(value);
}

function pairs(obj: Record<string, unknown> | undefined, labels: Record<string, string>): Row[] {
  if (!obj) return [];
  const rows: Row[] = [];
  for (const [key, label] of Object.entries(labels)) {
    const v = obj[key];
    if (v !== undefined && v !== null && v !== "") rows.push({ label, value: fmt(v) });
  }
  return rows;
}

function tableFrom<T extends Record<string, unknown>>(
  items: T[] | undefined,
  columns: { key: keyof T; label: string }[],
): Table | undefined {
  if (!items || items.length === 0) return undefined;
  const rows = items.map((item) =>
    columns.map((c) => {
      const v = item[c.key];
      return isScalar(v) ? v : fmt(v);
    }),
  );
  return { columns: columns.map((c) => c.label), rows };
}

function nonEmpty(block: Block): boolean {
  return (block.rows && block.rows.length > 0) || (block.table && block.table.rows.length > 0)
    ? true
    : false;
}

export function buildSections(sheet: Sheet): Section[] {
  const s: Section[] = [];

  // Cover
  s.push({
    id: "cover",
    name: "Cover",
    blocks: [
      {
        title: "Cover",
        rows: [
          { label: "Deal type", value: fmt(sheet.dealType) },
          ...pairs(sheet.cover, {
            loanOfficer: "Loan officer",
            loNmls: "LO NMLS",
            brokerCompanyName: "Broker / Company",
            brokerNmls: "Company NMLS",
            brokerAgreementDate: "Broker agreement date",
            subDate: "Submission date",
            estCOE: "Est. COE / fund",
            recourse: "Recourse",
            prepayStructure: "Prepay structure",
            fundingAmount: "Funding amount",
            fundingType: "Funding type",
            purpose: "Purpose",
            program: "Program",
            currentLender: "Current lender",
            borrowers: "Borrower(s)",
            primaryPhone: "Phone",
            email: "Email",
            subjectProperty: "Subject property",
            purchasePrice: "Purchase price",
            occupancy: "Occupancy",
            paymentType: "Payment type",
            propertyType: "Property type",
            escrowWaiver: "Escrow waiver",
            prepayPenalty: "Prepay penalty",
            compType: "Comp type",
            grossCompPct: "Gross comp %",
            brokerCompPct: "Broker comp %",
            flatFee: "Flat fee",
            lenderCompPlan: "Lender comp plan",
          }),
        ],
      },
      {
        title: "Lender pipeline",
        table: tableFrom(sheet.cover?.lenders, [
          { key: "name", label: "Lender" },
          { key: "submission", label: "Submission" },
          { key: "approval", label: "Approval" },
          { key: "appraisal", label: "Appraisal" },
          { key: "ctc", label: "CTC" },
          { key: "docsOut", label: "Docs out" },
          { key: "funded", label: "Funded" },
        ]),
      },
    ],
  });

  // Scenario
  const sc = sheet.scenario ?? {};
  s.push({
    id: "scenario",
    name: "Scenario",
    blocks: [
      {
        title: "Scenario snapshot",
        rows: pairs(sc as Record<string, unknown>, {
          loanPurpose: "Loan purpose",
          fundingType: "Funding type",
          age: "Age",
          propertyType: "Property type",
          propertyOwnership: "Property ownership",
          creditScore: "Credit score",
          propertyAddress: "Property address",
          propertyValue: "Property value",
          currentLoan1: "Current 1st",
          currentLoan2: "Current 2nd",
          proposedLoanAmount: "Proposed loan",
          oldPI: "Old P&I",
          newPI: "New P&I",
          oldPITIA: "Old PITIA",
          newPITIA: "New PITIA",
          income1: "Income 1",
          income2: "Income 2",
        }),
      },
      {
        title: "Debts",
        table: tableFrom(sc.debts, [
          { key: "label", label: "Label" },
          { key: "amount", label: "Amount" },
        ]),
      },
    ],
  });

  // Overview
  s.push({
    id: "overview",
    name: "Overview",
    blocks: [
      {
        title: "Overview",
        rows: [
          { label: "Client name", value: fmt(sheet.clientName) },
          { label: "Project name", value: fmt(sheet.projectName) },
          { label: "File name", value: fmt(sheet.fileName) },
          { label: "Lead ID", value: fmt(sheet.leadId) },
          { label: "Source", value: fmt(sheet.sourceType) },
          { label: "Funding type", value: fmt(sheet.fundingType) },
          { label: "Account executive", value: fmt(sheet.accountExecutive) },
          { label: "Owner", value: fmt(sheet.ownerName) },
          { label: "Start date", value: fmt(sheet.startDate) },
          { label: "Funded date", value: fmt(sheet.fundedDate) },
          { label: "Occupancy", value: fmt(sheet.occupancy) },
          { label: "Citizenship", value: fmt(sheet.citizenship) },
          { label: "BK history", value: fmt(sheet.bkHistory) },
          { label: "BK date", value: fmt(sheet.bkDate) },
          { label: "Late payments (12 mo)", value: fmt(sheet.latePaymentsLast12) },
        ].filter((r) => r.value !== ""),
      },
    ],
  });

  // Borrowers
  s.push({
    id: "borrowers",
    name: "Borrowers",
    blocks: [
      {
        title: "Borrowers",
        table: tableFrom(sheet.borrowers, [
          { key: "firstName", label: "First" },
          { key: "middleName", label: "Middle" },
          { key: "lastName", label: "Last" },
          { key: "fico", label: "FICO" },
          { key: "dob", label: "DOB" },
          { key: "ssn", label: "SSN" },
          { key: "mobile", label: "Mobile" },
          { key: "email", label: "Email" },
          { key: "employerName", label: "Employer" },
          { key: "employerPhone", label: "Emp. phone" },
          { key: "employerTenure", label: "Emp. tenure" },
          { key: "position", label: "Position" },
        ]),
      },
    ],
  });

  // Guarantors
  s.push({
    id: "guarantors",
    name: "Guarantors",
    blocks: [
      {
        title: "Guarantors",
        table: tableFrom(sheet.guarantors, [
          { key: "name", label: "Name" },
          { key: "role", label: "Role" },
          { key: "ownershipPct", label: "Ownership %" },
          { key: "fico", label: "FICO" },
          { key: "liquidAssets", label: "Liquid" },
          { key: "netWorth", label: "Net worth" },
          { key: "yearsExperience", label: "Years exp." },
          { key: "citizenship", label: "Citizenship" },
          { key: "mobile", label: "Mobile" },
          { key: "email", label: "Email" },
        ]),
      },
    ],
  });

  // Business
  const b = sheet.business ?? {};
  s.push({
    id: "business",
    name: "Business / Entity",
    blocks: [
      {
        title: "Entity",
        rows: pairs(b as Record<string, unknown>, {
          legalName: "Legal name",
          dba: "DBA",
          entityType: "Entity type",
          ein: "EIN",
          stateOfFormation: "State of formation",
          formationDate: "Formation date",
          industry: "Industry",
          naics: "NAICS",
          address: "Address",
          phone: "Phone",
          website: "Website",
          employees: "Employees",
        }),
      },
      {
        title: "Financials & credit",
        rows: pairs(b as Record<string, unknown>, {
          annualRevenue: "Annual revenue",
          annualNetProfit: "Annual net profit",
          avgMonthlyDeposits: "Avg monthly deposits",
          monthlyNSF: "Monthly NSFs",
          monthlyCardVolume: "Monthly card volume",
          personalGuaranteeRequired: "PG required?",
          paynet: "Paynet",
          dnbScore: "D&B",
          experianIntelliScore: "Experian Intelliscore",
        }),
      },
      {
        title: "Existing MCAs / business debt",
        rows: pairs(b as Record<string, unknown>, {
          hasExistingMCA: "Has existing MCA?",
          existingMCACount: "# MCAs",
          existingMCABalance: "MCA balance",
          mcaPaymentsPerMonth: "Payments / month",
        }),
      },
      {
        title: "Financing request",
        rows: pairs(b as Record<string, unknown>, {
          fundingProduct: "Funding product",
          requestedAmount: "Requested amount",
          requestedTermMonths: "Requested term (months)",
          useOfFunds: "Use of funds",
          useOfFundsNotes: "Use of funds — detail",
        }),
      },
      {
        title: "Owners",
        table: tableFrom(b.owners, [
          { key: "name", label: "Name" },
          { key: "title", label: "Title" },
          { key: "ownershipPct", label: "Ownership %" },
          { key: "fico", label: "FICO" },
        ]),
      },
      { title: "Notes", rows: b.notes ? [{ label: "Notes", value: b.notes }] : [] },
    ],
  });

  // Property
  s.push({
    id: "property",
    name: "Property",
    blocks: [
      {
        title: "Subject property",
        rows: pairs(sheet.subjectProperty as Record<string, unknown> | undefined, {
          address: "Address",
          city: "City",
          state: "State",
          zip: "Zip",
          estimatedValue: "Estimated value",
          estCurrentMortgageBalance: "Est. current mortgage",
          timeInHouse: "Time in house",
          sqFt: "Sq ft",
          lotSqFt: "Lot sq ft",
          yearBuilt: "Year built",
        }),
      },
      {
        title: "Primary property",
        rows: pairs(sheet.primaryProperty as Record<string, unknown> | undefined, {
          address: "Address",
          city: "City",
          state: "State",
          zip: "Zip",
          estimatedValue: "Estimated value",
          estCurrentMortgageBalance: "Est. current mortgage",
          timeInHouse: "Time in house",
          sqFt: "Sq ft",
          lotSqFt: "Lot sq ft",
          yearBuilt: "Year built",
        }),
      },
    ],
  });

  // Commercial
  const c = sheet.commercial ?? {};
  s.push({
    id: "commercial",
    name: "Commercial / DSCR",
    blocks: [
      {
        title: "Classification",
        rows: pairs(c as Record<string, unknown>, {
          propertyClass: "Class",
          propertySubType: "Sub-type",
          units: "Units",
          rentableSqFt: "Rentable sq ft",
          yearBuilt: "Year built",
          yearRenovated: "Year renovated",
          occupancyPct: "Occupancy %",
        }),
      },
      {
        title: "Rent roll (annual)",
        rows: pairs(c as Record<string, unknown>, {
          grossScheduledRent: "Gross scheduled rent",
          vacancyPct: "Vacancy %",
          otherIncome: "Other income",
        }),
      },
      {
        title: "Operating expenses (annual)",
        rows: pairs(c as Record<string, unknown>, {
          opExTaxes: "Taxes",
          opExInsurance: "Insurance",
          opExManagement: "Management",
          opExRepairs: "Repairs & maintenance",
          opExUtilities: "Utilities",
          opExOther: "Other",
        }),
      },
      {
        title: "Loan terms",
        rows: pairs(c as Record<string, unknown>, {
          fundingAmount: "Funding amount",
          ratePct: "Rate %",
          amortizationYears: "Amortization (years)",
          termMonths: "Term (months)",
          recourse: "Recourse",
          prepayStructure: "Prepay structure",
        }),
      },
      {
        title: "Sponsor & exit",
        rows: pairs(c as Record<string, unknown>, {
          sponsorLiquidity: "Sponsor liquidity",
          sponsorNetWorth: "Sponsor net worth",
          exitStrategy: "Exit strategy",
          notes: "Notes",
        }),
      },
    ],
  });

  // Hard money
  const h = sheet.hardMoney ?? {};
  s.push({
    id: "hardmoney",
    name: "Hard Money",
    blocks: [
      {
        title: "Deal structure",
        rows: pairs(h as Record<string, unknown>, {
          product: "Product",
          rehabScope: "Rehab scope",
          exitStrategy: "Exit strategy",
        }),
      },
      {
        title: "Values & loan sizing",
        rows: pairs(h as Record<string, unknown>, {
          purchasePrice: "Purchase price",
          rehabBudget: "Rehab budget",
          asIsValue: "As-is value",
          arv: "ARV",
          initialLoan: "Initial loan",
          rehabHoldback: "Rehab holdback",
        }),
      },
      {
        title: "Pricing & terms",
        rows: pairs(h as Record<string, unknown>, {
          ratePct: "Rate %",
          points: "Points %",
          termMonths: "Term (months)",
          prepayPenalty: "Prepay penalty",
          exitFee: "Exit fee",
          extensionMonths: "Extension (months)",
          extensionFee: "Extension fee %",
          interestReserveMonths: "I/O reserve (months)",
          drawFee: "Draw fee",
        }),
      },
      {
        title: "Rehab line items",
        table: tableFrom(h.rehabLines, [
          { key: "category", label: "Category" },
          { key: "description", label: "Description" },
          { key: "amount", label: "Amount" },
          { key: "draw", label: "Draw #" },
        ]),
      },
      {
        title: "Exit & profit",
        rows: pairs(h as Record<string, unknown>, {
          projectedSale: "Projected sale",
          projectedHoldMonths: "Projected hold (months)",
          sellingCostsPct: "Selling costs %",
          monthlyHoldingCosts: "Monthly holding cost",
        }),
      },
      {
        title: "Sponsor track record",
        rows: pairs(h as Record<string, unknown>, {
          experienceFlips24: "Flips last 24 mo",
          experienceFlips36: "Flips last 36 mo",
          rentalsOwned: "Rentals owned",
          volumeLifetime: "Lifetime volume",
          notes: "Notes",
        }),
      },
    ],
  });

  // Loans
  s.push({
    id: "loans",
    name: "Loans",
    blocks: [
      {
        title: "Current loans",
        table: tableFrom(sheet.loans, [
          { key: "position", label: "Position" },
          { key: "lenderName", label: "Lender" },
          { key: "loanNumber", label: "Loan #" },
          { key: "purpose", label: "Purpose" },
          { key: "type", label: "Type" },
          { key: "currentBalance", label: "Balance" },
          { key: "originalAmount", label: "Orig. amount" },
          { key: "currentRate", label: "Rate" },
          { key: "rateType", label: "Rate type" },
          { key: "currentPI", label: "P&I" },
          { key: "pitia", label: "PITIA" },
          { key: "taxes", label: "Taxes" },
          { key: "insurance", label: "Insurance" },
          { key: "hoa", label: "HOA" },
          { key: "pmi", label: "PMI" },
          { key: "impounds", label: "Impounds" },
        ]),
      },
    ],
  });

  // Income
  s.push({
    id: "income",
    name: "Income",
    blocks: [
      {
        title: "Income rows",
        table: tableFrom(sheet.incomeRows, [
          { key: "borrower", label: "Borrower" },
          { key: "source", label: "Source" },
          { key: "description", label: "Description" },
          { key: "monthlyAmount", label: "Monthly" },
          { key: "notes", label: "Notes" },
        ]),
      },
    ],
  });

  // Assets & Liabilities
  s.push({
    id: "assets",
    name: "Assets & Liabilities",
    blocks: [
      {
        title: "Assets",
        table: tableFrom(sheet.assets, [
          { key: "description", label: "Description" },
          { key: "estimatedValue", label: "Estimated value" },
          { key: "notes", label: "Notes" },
        ]),
      },
      {
        title: "Liabilities",
        table: tableFrom(sheet.liabilities, [
          { key: "description", label: "Description" },
          { key: "monthlyPayment", label: "Monthly payment" },
          { key: "balance", label: "Balance" },
          { key: "notes", label: "Notes" },
        ]),
      },
    ],
  });

  // Household
  s.push({
    id: "household",
    name: "Household",
    blocks: [
      {
        title: "Dependents",
        rows: [
          { label: "Dependents count", value: fmt(sheet.dependentsCount) },
          { label: "Dependents ages", value: fmt(sheet.dependentsAges) },
        ].filter((r) => r.value !== ""),
      },
    ],
  });

  // DTI
  const d = sheet.dti ?? {};
  s.push({
    id: "dti",
    name: "DTI",
    blocks: [
      {
        title: "Household & incomes",
        rows: pairs(d as Record<string, unknown>, { familySize: "Family size" }),
      },
      {
        title: "Income lines",
        table: tableFrom(d.incomes, [
          { key: "label", label: "Label" },
          { key: "amount", label: "Amount" },
        ]),
      },
      {
        title: "Housing (proposed)",
        rows: pairs(d as Record<string, unknown>, {
          purchasePrice: "Purchase price",
          downPaymentPct: "Down payment %",
          fundingAmount: "Funding amount",
          termMonths: "Term (months)",
          interestRate: "Interest rate",
          propertyTaxRate: "Property tax rate",
          propertyTaxesMonthly: "Property taxes / mo",
          homeownersInsuranceMonthly: "Insurance / mo",
          hoa: "HOA",
          fhaMiRate: "FHA MI rate",
          fhaMiMonthly: "FHA MI / mo",
        }),
      },
      {
        title: "Consumer debts",
        rows: pairs(d.debts as Record<string, unknown> | undefined, {
          cars: "Cars",
          revolving: "Revolving",
          installment: "Installment",
          other: "Other",
        }),
      },
    ],
  });

  // REO
  s.push({
    id: "reo",
    name: "Schedule of REO",
    blocks: [
      {
        title: "REO",
        table: tableFrom(sheet.reo, [
          { key: "usage", label: "Usage" },
          { key: "address", label: "Address" },
          { key: "state", label: "State" },
          { key: "propertyType", label: "Type" },
          { key: "marketValue", label: "Market value" },
          { key: "position", label: "Position" },
          { key: "balance", label: "Balance" },
          { key: "rate", label: "Rate" },
          { key: "mortgagePayment", label: "Mtg payment" },
          { key: "taxes", label: "Taxes" },
          { key: "insurance", label: "Insurance" },
          { key: "hoa", label: "HOA" },
          { key: "escrow", label: "Escrow" },
          { key: "grossRent", label: "Gross rent" },
          { key: "netRent", label: "Net rent" },
          { key: "apn", label: "APN" },
          { key: "purchasedDate", label: "Purchased" },
        ]),
      },
    ],
  });

  // Comparison
  const cmp = sheet.comparison ?? {};
  s.push({
    id: "comparison",
    name: "Comparison",
    blocks: [
      {
        title: "Header",
        rows: pairs(cmp as Record<string, unknown>, {
          preparedFor: "Prepared for",
          asOfDate: "As of",
          notes: "Notes",
        }),
      },
      {
        title: "Current loan",
        rows: pairs(cmp.current as Record<string, unknown> | undefined, {
          fundingAmount: "Funding amount",
          ratePct: "Rate %",
          termMonths: "Term (months)",
          escrowMonthly: "Escrow / mo",
        }),
      },
      {
        title: "Proposed loan",
        rows: pairs(cmp.proposed as Record<string, unknown> | undefined, {
          fundingAmount: "Funding amount",
          ratePct: "Rate %",
          termMonths: "Term (months)",
          escrowMonthly: "Escrow / mo",
        }),
      },
    ],
  });

  // Weighted interest
  s.push({
    id: "weighted",
    name: "Weighted Interest",
    blocks: [
      {
        title: "Debts",
        table: tableFrom(sheet.weightedInterest, [
          { key: "account", label: "Account" },
          { key: "balance", label: "Balance" },
          { key: "ratePct", label: "Rate %" },
          { key: "monthlyPayment", label: "Monthly payment" },
          { key: "note", label: "Note" },
        ]),
      },
    ],
  });

  // Payoff
  const p = sheet.payoff ?? {};
  s.push({
    id: "payoff",
    name: "Payoff Calc",
    blocks: [
      {
        title: "Payoff",
        rows: pairs(p as Record<string, unknown>, {
          fundingAmount: "Funding amount",
          annualRatePct: "Annual rate %",
          periodYears: "Period (years)",
          extraPayment: "Extra payment",
          startDate: "Start date",
          preparedFor: "Prepared for",
        }),
      },
    ],
  });

  // Day counter
  const dc = sheet.dayCounter ?? {};
  s.push({
    id: "daycounter",
    name: "Day Counter",
    blocks: [
      {
        title: "Dates",
        rows: [
          ...pairs(dc.noteDate, { label: "Note — label", date1: "Note date 1", date2: "Note date 2" }),
          ...pairs(dc.firstPaymentDate, { label: "First pmt — label", date1: "First pmt 1", date2: "First pmt 2" }),
          ...pairs(dc.additional, { label: "Addl — label", date1: "Addl date 1", date2: "Addl date 2" }),
        ],
      },
    ],
  });

  // Workflow
  s.push({
    id: "workflow",
    name: "Workflow",
    blocks: [
      {
        title: "Workflow",
        table: tableFrom(sheet.workflow, [
          { key: "label", label: "Step" },
          { key: "done", label: "Done" },
          { key: "date", label: "Date" },
        ]),
      },
    ],
  });

  // Fees
  const f = sheet.fees ?? {};
  s.push({
    id: "fees",
    name: "Fees & Closing",
    blocks: [
      {
        title: "Broker fees",
        rows: pairs(f.broker as Record<string, unknown> | undefined, {
          origination: "Origination",
          processing: "Processing",
          underwriting: "Underwriting",
          flatFee: "Flat broker fee",
        }),
      },
      {
        title: "Lender fees",
        rows: pairs(f.lender as Record<string, unknown> | undefined, {
          origination: "Origination",
          discount: "Discount",
          underwriting: "Underwriting",
          processing: "Processing",
          docPrep: "Doc prep",
          admin: "Admin",
          funding: "Funding",
          pointsPct: "Points %",
        }),
      },
      {
        title: "Third-party",
        rows: pairs(f.thirdParty as Record<string, unknown> | undefined, {
          appraisal: "Appraisal",
          environmental: "Environmental",
          inspection: "Inspection",
          titleInsurance: "Title insurance",
          escrow: "Escrow",
          recording: "Recording",
          legal: "Legal",
          survey: "Survey",
        }),
      },
      {
        title: "Prepaids & reserves",
        rows: pairs(f.prepaids as Record<string, unknown> | undefined, {
          perDiemDays: "Per-diem days",
          taxReserve: "Tax reserve",
          insuranceReserve: "Insurance reserve",
          hoa: "HOA",
        }),
      },
      {
        title: "Adjustments",
        rows: pairs(f as Record<string, unknown>, {
          wireFee: "Wire fee",
          creditsToBorrower: "Credits to borrower",
          notes: "Notes",
        }),
      },
    ],
  });

  // Notes
  s.push({
    id: "notes",
    name: "Notes",
    blocks: [
      {
        title: "Notes",
        rows: [
          { label: "Primary objective", value: fmt(sheet.primaryObjective) },
          { label: "Additional notes", value: fmt(sheet.additionalNotes) },
        ].filter((r) => r.value !== ""),
      },
    ],
  });

  // Drop sections with no content
  return s
    .map((sec) => ({ ...sec, blocks: sec.blocks.filter(nonEmpty) }))
    .filter((sec) => sec.blocks.length > 0);
}

/* ============================== CSV ============================== */

export function exportCSV(sheet: Sheet) {
  const sections = buildSections(sheet);
  const lines: string[] = [];
  lines.push(["Section", "Block", "Field", "Value"].map(csvEscape).join(","));

  for (const sec of sections) {
    for (const block of sec.blocks) {
      if (block.rows) {
        for (const row of block.rows) {
          lines.push([sec.name, block.title, row.label, row.value].map(csvEscape).join(","));
        }
      }
      if (block.table) {
        lines.push(""); // separator
        lines.push(
          [sec.name, block.title, ...block.table.columns].map(csvEscape).join(","),
        );
        for (const row of block.table.rows) {
          lines.push(["", "", ...row.map((c) => csvEscape(c ?? ""))].join(","));
        }
      }
    }
  }

  const csv = lines.join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${fileBase(sheet)}.csv`);
}

/* ============================== Excel ============================== */

export async function exportXLSX(sheet: Sheet) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Intake Sheet App";
  wb.created = new Date();

  const sections = buildSections(sheet);

  // Summary sheet
  const summary = wb.addWorksheet("Summary", {
    properties: { defaultColWidth: 22 },
  });
  summary.columns = [
    { header: "Field", key: "field", width: 30 },
    { header: "Value", key: "value", width: 48 },
  ];
  summary.getRow(1).font = { bold: true };
  const headerFill = "FF111827";
  styleHeader(summary.getRow(1), headerFill);
  const summaryRows: [string, string][] = [
    ["Borrower", [sheet.borrowers?.[0]?.firstName, sheet.borrowers?.[0]?.lastName].filter(Boolean).join(" ")],
    ["Lead ID", sheet.leadId ?? ""],
    ["Deal type", sheet.dealType ?? ""],
    ["Funding type", sheet.fundingType ?? ""],
    ["Loan officer", sheet.cover?.loanOfficer ?? ""],
    ["Funding amount", sheet.cover?.fundingAmount ?? sheet.scenario?.proposedLoanAmount ?? ""],
    ["Property address", sheet.scenario?.propertyAddress ?? ""],
    ["Property value", sheet.scenario?.propertyValue ?? sheet.subjectProperty?.estimatedValue ?? ""],
    ["Submission date", sheet.cover?.subDate ?? ""],
    ["Est. COE / fund", sheet.cover?.estCOE ?? ""],
    ["Exported", new Date().toLocaleString()],
  ];
  summaryRows.forEach(([field, value]) => summary.addRow({ field, value }));

  // One sheet per section
  for (const sec of sections) {
    const name = sec.name.slice(0, 31).replace(/[\\/?*[\]:]/g, " ");
    const ws = wb.addWorksheet(name, { properties: { defaultColWidth: 18 } });
    let rowIdx = 1;

    for (const block of sec.blocks) {
      // Title row
      const title = ws.getRow(rowIdx);
      title.getCell(1).value = block.title;
      title.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      title.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: headerFill },
      };
      ws.mergeCells(rowIdx, 1, rowIdx, 6);
      rowIdx += 1;

      if (block.rows && block.rows.length) {
        const hdr = ws.getRow(rowIdx);
        hdr.getCell(1).value = "Field";
        hdr.getCell(2).value = "Value";
        styleSubHeader(hdr);
        rowIdx += 1;
        for (const row of block.rows) {
          const r = ws.getRow(rowIdx);
          r.getCell(1).value = row.label;
          r.getCell(2).value = row.value;
          rowIdx += 1;
        }
        rowIdx += 1;
      }

      if (block.table) {
        const hdr = ws.getRow(rowIdx);
        block.table.columns.forEach((c, i) => (hdr.getCell(i + 1).value = c));
        styleSubHeader(hdr);
        rowIdx += 1;
        for (const row of block.table.rows) {
          const r = ws.getRow(rowIdx);
          row.forEach((cell, i) => (r.getCell(i + 1).value = cell ?? ""));
          rowIdx += 1;
        }
        rowIdx += 1;
      }
    }

    ws.columns.forEach((col) => {
      let max = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const v = cell.value == null ? "" : String(cell.value);
        if (v.length > max) max = Math.min(v.length, 60);
      });
      col.width = max + 2;
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${fileBase(sheet)}.xlsx`);
}

function styleHeader(row: import("exceljs").Row, fillArgb: string) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fillArgb },
    };
  });
}

function styleSubHeader(row: import("exceljs").Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF111827" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3F4F6" },
    };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
  });
}

/* ============================== JSON backup ============================== */

export function exportJSON(sheet: Sheet) {
  const blob = new Blob([JSON.stringify(sheet, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${fileBase(sheet)}.json`);
}
