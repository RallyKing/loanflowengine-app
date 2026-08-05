/**
 * Maps Personal Financial Statement data → BlockPdfExportSpec for fillable PDF.
 */
import {
  computePersonalFinancialStatement,
  formatPfsMoney,
  type PersonalFinancialStatement,
} from "@/lib/pfs/personalFinancialStatementModel";
import type { BlockPdfExportSpec, BlockPdfField } from "../types";

function moneyField(
  id: string,
  label: string,
  value: string | undefined,
  opts?: { readonly?: boolean; fullWidth?: boolean },
): BlockPdfField {
  return {
    id,
    label,
    value: value ?? "",
    kind: opts?.readonly ? "readonly" : "money",
    fullWidth: opts?.fullWidth,
  };
}

function textField(
  id: string,
  label: string,
  value: string | undefined,
  opts?: { fullWidth?: boolean; multiline?: boolean },
): BlockPdfField {
  return {
    id,
    label,
    value: value ?? "",
    kind: opts?.multiline ? "multiline" : "text",
    fullWidth: opts?.fullWidth,
  };
}

/**
 * Build a client-ready fillable PDF spec covering all PFS sections.
 * Prefills known values; empty schedule rows stay blank for the client.
 */
export function buildPfsBlockPdfSpec(
  pfs: PersonalFinancialStatement,
  opts?: { fileName?: string },
): BlockPdfExportSpec {
  const computed = computePersonalFinancialStatement(pfs);
  const a = pfs.assets;
  const l = pfs.liabilities;
  const ac = computed.assetColumn;
  const lc = computed.liabilityColumn;
  const h = pfs.header;

  return {
    blockId: "pfs",
    title: "Personal Financial Statement",
    subtitle:
      "SBA-style PFS — complete applicable fields. Round dollar amounts up to whole dollars.",
    fileName: opts?.fileName ?? "Personal_Financial_Statement.pdf",
    footerNote:
      "I certify that the information provided is true and complete to the best of my knowledge. Schedule totals roll into assets/liabilities; net worth = total assets - total liabilities.",
    sections: [
      {
        id: "applicant",
        title: "Applicant",
        fields: [
          textField("header.names", "Name(s)", h.names, { fullWidth: true }),
          textField("header.statementDate", "Statement date", h.statementDate),
          textField(
            "header.residenceAddress",
            "Residence address",
            h.residenceAddress,
            { fullWidth: true },
          ),
          textField("header.city", "City", h.city),
          textField("header.state", "State", h.state),
          textField("header.zip", "ZIP", h.zip),
          textField("header.residencePhone", "Residence phone", h.residencePhone),
          textField(
            "header.businessName",
            "Business name of applicant/borrower",
            h.businessName,
            { fullWidth: true },
          ),
          textField("header.businessPhone", "Business phone", h.businessPhone),
        ],
      },
      {
        id: "assets",
        title: "Assets ($ only, round up)",
        fields: [
          moneyField("assets.cash", "Cash on hands & in Banks", a.cashOnHandAndBanks),
          moneyField("assets.savings", "Savings Accounts", a.savingsAccounts),
          moneyField("assets.ira", "IRA or Other Retirement Account", a.iraOrRetirement),
          moneyField(
            "assets.receivable",
            "Accounts & Notes Receivable",
            a.accountsAndNotesReceivable,
          ),
          moneyField(
            "assets.lifeCalc",
            "Life Insurance — Cash Surrender Value (from Section 8)",
            formatPfsMoney(ac.lifeInsuranceCashSurrender),
            { readonly: true },
          ),
          moneyField(
            "assets.stocksCalc",
            "Stocks & Bonds (from Section 3)",
            formatPfsMoney(ac.stocksAndBonds),
            { readonly: true },
          ),
          moneyField(
            "assets.reCalc",
            "Real Estate (from Section 4)",
            formatPfsMoney(ac.realEstate),
            { readonly: true },
          ),
          moneyField(
            "assets.auto",
            "Automobile — Present Value",
            a.automobilePresentValue,
          ),
          moneyField(
            "assets.otherPersonal",
            "Other Personal Property (Section 5)",
            a.otherPersonalProperty,
          ),
          moneyField("assets.other", "Other Assets (Section 5)", a.otherAssets),
          moneyField(
            "assets.total",
            "Total assets",
            formatPfsMoney(computed.totalAssets),
            { readonly: true, fullWidth: true },
          ),
        ],
      },
      {
        id: "liabilities",
        title: "Liabilities ($ only, round up)",
        fields: [
          moneyField("liab.ap", "Accounts Payable", l.accountsPayable),
          moneyField(
            "liab.notesCalc",
            "Notes Payable to Banks and Others (from Section 2)",
            formatPfsMoney(lc.notesPayableToBanksAndOthers),
            { readonly: true },
          ),
          moneyField(
            "liab.autoBal",
            "Installment Account (Auto) — Balance",
            l.installmentAccountAuto,
          ),
          moneyField(
            "liab.autoMo",
            "Installment Account (Auto) — Mo. pmt",
            l.installmentAccountAutoMonthly,
          ),
          moneyField(
            "liab.otherBal",
            "Installment Account (Other) — Balance",
            l.installmentAccountOther,
          ),
          moneyField(
            "liab.otherMo",
            "Installment Account (Other) — Mo. pmt",
            l.installmentAccountOtherMonthly,
          ),
          moneyField(
            "liab.loanLife",
            "Loan on Life Insurance",
            l.loanOnLifeInsurance,
          ),
          moneyField(
            "liab.mortgageCalc",
            "Mortgages on Real Estate (Section 4 A–D)",
            formatPfsMoney(lc.mortgagesOnRealEstate),
            { readonly: true },
          ),
          moneyField("liab.taxes", "Unpaid Taxes", l.unpaidTaxes),
          moneyField("liab.other", "Other Liabilities", l.otherLiabilities),
          moneyField(
            "liab.total",
            "Total liabilities",
            formatPfsMoney(computed.totalLiabilities),
            { readonly: true },
          ),
          moneyField(
            "liab.netWorth",
            "Net worth",
            formatPfsMoney(computed.netWorth),
            { readonly: true },
          ),
        ],
      },
      {
        id: "section1",
        title: "Section 1. Source of Income",
        fields: [
          moneyField("income.salary", "Salary", pfs.income.salary),
          moneyField(
            "income.netInvest",
            "Net Investment Income",
            pfs.income.netInvestmentIncome,
          ),
          moneyField(
            "income.re",
            "Real Estate Income",
            pfs.income.realEstateIncome,
          ),
          moneyField("income.other", "Other Income", pfs.income.otherIncome),
          textField(
            "income.otherDesc",
            "Description of Other Income",
            pfs.income.otherIncomeDescription,
            { fullWidth: true, multiline: true },
          ),
        ],
      },
      {
        id: "contingent",
        title: "Contingent Liabilities",
        fields: [
          moneyField(
            "cont.endorser",
            "As Endorser or Co-Maker",
            pfs.contingentLiabilities.asEndorserOrCoMaker,
          ),
          moneyField(
            "cont.legal",
            "Legal Claims & Judgments",
            pfs.contingentLiabilities.legalClaimsAndJudgments,
          ),
          moneyField(
            "cont.tax",
            "Provision for Federal Income Tax",
            pfs.contingentLiabilities.provisionForFederalIncomeTax,
          ),
          moneyField(
            "cont.other",
            "Other Special Debt",
            pfs.contingentLiabilities.otherSpecialDebt,
          ),
        ],
      },
      {
        id: "section2",
        title: "Section 2. Notes payable to banks and others",
        description:
          "List notes payable (banks and others). Current balances roll into liabilities.",
        minRows: 7,
        columns: [
          { id: "noteholder", label: "Noteholder name & address", weight: 2.2 },
          { id: "original", label: "Original bal. / credit", weight: 1, kind: "money" },
          { id: "current", label: "Current balance", weight: 1, kind: "money" },
          { id: "payment", label: "Payment amount", weight: 0.9, kind: "money" },
          { id: "frequency", label: "Frequency", weight: 0.8 },
          { id: "secured", label: "How secured / collateral", weight: 1.4 },
        ],
        rows: pfs.notesPayable.map((row) => ({
          noteholder: row.noteholderNameAddress,
          original: row.originalBalanceOrCreditLimit,
          current: row.currentBalance,
          payment: row.paymentAmount,
          frequency: row.paymentFrequency,
          secured: row.howSecuredOrCollateral,
        })),
      },
      {
        id: "section3",
        title: "Section 3. Stocks and bonds",
        minRows: 4,
        columns: [
          { id: "shares", label: "# Shares", weight: 0.7, kind: "money" },
          { id: "name", label: "Names of securities", weight: 2 },
          { id: "cost", label: "Cost", weight: 0.9, kind: "money" },
          { id: "market", label: "Market value / quotation", weight: 1.1, kind: "money" },
          { id: "date", label: "Date of quotation", weight: 1 },
        ],
        rows: pfs.stocksAndBonds.map((row) => ({
          shares: row.numberOfShares,
          name: row.namesOfSecurities,
          cost: row.cost,
          market: row.marketValueQuotation,
          date: row.dateOfQuotation,
        })),
      },
      {
        id: "section4",
        title: "Section 4. Real estate owned (Properties A–H)",
        description:
          "Enter each property. Present market values roll into assets; mortgage balances A–D roll into liabilities.",
        minRows: 8,
        columns: [
          { id: "key", label: "Prop", weight: 0.45 },
          { id: "type", label: "Type of property", weight: 1.2 },
          { id: "address", label: "Address", weight: 1.6 },
          { id: "interest", label: "% Int.", weight: 0.55 },
          { id: "purchased", label: "Date purchased", weight: 0.9 },
          { id: "cost", label: "Original cost", weight: 0.9, kind: "money" },
          { id: "market", label: "Present mkt", weight: 0.9, kind: "money" },
          { id: "mortgage", label: "Mortgage bal.", weight: 0.9, kind: "money" },
        ],
        rows: pfs.realEstateOwned.map((parcel) => ({
          key: parcel.key,
          type: parcel.typeOfProperty,
          address: parcel.address,
          interest: parcel.percentInterest,
          purchased: parcel.datePurchased,
          cost: parcel.originalCost,
          market: parcel.presentMarketValue,
          mortgage: parcel.mortgageBalance,
        })),
      },
      {
        id: "section5",
        title: "Section 5. Other personal property / assets",
        fields: [
          textField(
            "notes.otherPersonal",
            "Describe other personal property and other assets",
            pfs.otherPersonalPropertyNotes,
            { fullWidth: true, multiline: true },
          ),
        ],
      },
      {
        id: "section6",
        title: "Section 6. Unpaid taxes",
        fields: [
          textField(
            "notes.unpaidTaxes",
            "Describe unpaid taxes (type, to whom, amount, when due)",
            pfs.unpaidTaxesNotes,
            { fullWidth: true, multiline: true },
          ),
        ],
      },
      {
        id: "section7",
        title: "Section 7. Other liabilities",
        fields: [
          textField(
            "notes.otherLiab",
            "Describe other liabilities",
            pfs.otherLiabilitiesNotes,
            { fullWidth: true, multiline: true },
          ),
        ],
      },
      {
        id: "section8",
        title: "Section 8. Life insurance held",
        minRows: 4,
        columns: [
          { id: "company", label: "Company", weight: 1.5 },
          { id: "face", label: "Face amount", weight: 1, kind: "money" },
          { id: "cash", label: "Cash value", weight: 1, kind: "money" },
          { id: "beneficiary", label: "Beneficiary", weight: 1.5 },
        ],
        rows: pfs.lifeInsurance.map((row) => ({
          company: row.company,
          face: row.faceAmount,
          cash: row.cashValue,
          beneficiary: row.beneficiary,
        })),
      },
      {
        id: "signatures",
        title: "Certification / signatures",
        fields: [
          textField(
            "sig0.signature",
            "Signature (1)",
            pfs.signatures[0]?.signature,
          ),
          textField("sig0.date", "Date (1)", pfs.signatures[0]?.date),
          textField(
            "sig0.ssn",
            "Social Security No. (1)",
            pfs.signatures[0]?.socialSecurityNo,
          ),
          textField(
            "sig1.signature",
            "Signature (2)",
            pfs.signatures[1]?.signature,
          ),
          textField("sig1.date", "Date (2)", pfs.signatures[1]?.date),
          textField(
            "sig1.ssn",
            "Social Security No. (2)",
            pfs.signatures[1]?.socialSecurityNo,
          ),
          textField("notes.general", "Additional notes", pfs.notes, {
            fullWidth: true,
            multiline: true,
          }),
        ],
      },
    ],
  };
}
