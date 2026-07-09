/**
 * FNMA 3.4 / MISMO v3.4 Residential Loan Application (URLA) XML exporter.
 *
 * Produces a MESSAGE envelope that most LOS platforms that accept MISMO 3.4
 * (Encompass, Arive, LendingPad, LoanBeam, etc.) can import as a new 1003.
 *
 * This is a pragmatic mapping of the fields we collect — not every MISMO 3.4
 * element is populated, but the important ones (subject property, loan terms,
 * borrowers, income, assets, liabilities, declarations) are.
 */
import type { Doc } from "@/convex/_generated/dataModel";

type Sheet = Doc<"intakeSheets">;

/* ============================== Helpers ============================== */

const XML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function esc(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[&<>"']/g, (c) => XML_ESCAPE[c] ?? c);
}

function hasText(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const stripped = v.replace(/[$,%\s]/g, "");
    if (!stripped) return null;
    const n = Number(stripped);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function dec(v: unknown, digits = 2): string | null {
  const n = num(v);
  if (n === null) return null;
  return n.toFixed(digits);
}

function int(v: unknown): string | null {
  const n = num(v);
  if (n === null) return null;
  return String(Math.round(n));
}

/** Accepts MM/DD/YYYY, M/D/YY, YYYY-MM-DD, etc.; returns YYYY-MM-DD or null. */
function isoDate(v: unknown): string | null {
  if (!hasText(v)) return null;
  const s = v.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  if (iso.test(s)) return s;
  const slash = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/;
  const m = s.match(slash);
  if (m) {
    const [, mo, dd, rawYy] = m;
    const yy =
      rawYy.length === 2
        ? Number(rawYy) > 50
          ? `19${rawYy}`
          : `20${rawYy}`
        : rawYy;
    return `${yy}-${mo.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  if (Number.isFinite(t)) {
    const d = new Date(t);
    const yyyy = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mo}-${dd}`;
  }
  return null;
}

/** Strips non-digits and returns 10 digits of phone (empty if not enough). */
function phone(v: unknown): string | null {
  if (!hasText(v)) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function ssn(v: unknown): string | null {
  if (!hasText(v)) return null;
  const d = v.replace(/\D/g, "");
  if (d.length !== 9) return null;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

function ein(v: unknown): string | null {
  if (!hasText(v)) return null;
  const d = v.replace(/\D/g, "");
  if (d.length !== 9) return null;
  return `${d.slice(0, 2)}-${d.slice(2)}`;
}

function zip(v: unknown): string | null {
  if (!hasText(v)) return null;
  const d = v.replace(/\D/g, "");
  if (d.length < 5) return null;
  if (d.length >= 9) return `${d.slice(0, 5)}-${d.slice(5, 9)}`;
  return d.slice(0, 5);
}

function termMonthsFromYears(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  return Math.round(n * 12);
}

/* ============================== XML builder ============================== */

type Child = XmlEl | string | number | null | undefined | false;

class XmlEl {
  constructor(
    public tag: string,
    public attrs: Record<string, string | undefined> = {},
    public children: Child[] = [],
  ) {}

  add(...c: Child[]) {
    for (const child of c) if (child !== null && child !== undefined && child !== false) this.children.push(child);
    return this;
  }

  /** Add a leaf element only if value is present. */
  leaf(tag: string, value: unknown) {
    if (value === null || value === undefined) return this;
    if (typeof value === "string" && value.trim() === "") return this;
    this.children.push(new XmlEl(tag, {}, [String(value)]));
    return this;
  }

  isEmpty(): boolean {
    return this.children.every(
      (c) => c === null || c === undefined || c === false || (typeof c === "string" && c === "") || (c instanceof XmlEl && c.isEmpty()),
    );
  }

  render(indent = 0): string {
    const pad = "  ".repeat(indent);
    const attrs = Object.entries(this.attrs)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => ` ${k}="${esc(v as string)}"`)
      .join("");
    if (this.children.length === 0) return `${pad}<${this.tag}${attrs} />`;
    // Self-prune empty container elements so we don't emit <PARTIES /><PARTIES />.
    const kids = this.children.filter((c) => {
      if (c === null || c === undefined || c === false) return false;
      if (c instanceof XmlEl && c.isEmpty()) return false;
      return true;
    });
    if (kids.length === 0) return `${pad}<${this.tag}${attrs} />`;
    const inline = kids.length === 1 && typeof kids[0] !== "object";
    if (inline) {
      return `${pad}<${this.tag}${attrs}>${esc(kids[0] as string | number)}</${this.tag}>`;
    }
    const body = kids
      .map((c) =>
        c instanceof XmlEl
          ? c.render(indent + 1)
          : `${pad}  ${esc(c as string | number)}`,
      )
      .join("\n");
    return `${pad}<${this.tag}${attrs}>\n${body}\n${pad}</${this.tag}>`;
  }
}

function el(
  tag: string,
  attrs: Record<string, string | undefined> = {},
  ...children: Child[]
): XmlEl {
  return new XmlEl(tag, attrs, children);
}

/* ============================== Enum mappings ============================== */

function mapLoanPurpose(v: unknown): string {
  if (!hasText(v)) return "Other";
  const s = v.toLowerCase();
  if (s.includes("purchase")) return "Purchase";
  if (s.includes("cash")) return "Refinance";
  if (s.includes("refi") || s.includes("rate") || s.includes("term")) return "Refinance";
  if (s.includes("construction")) return "ConstructionOnly";
  if (s.includes("construction to perm")) return "ConstructionToPermanent";
  return "Other";
}

function refinanceCashOut(v: unknown): string | null {
  if (!hasText(v)) return null;
  const s = v.toLowerCase();
  if (s.includes("cash")) return "CashOut";
  if (s.includes("rate") || s.includes("term") || s.includes("refi")) return "NoCashOut";
  return null;
}

function mapMortgageType(v: unknown): string {
  if (!hasText(v)) return "Conventional";
  const s = v.toLowerCase();
  if (s.includes("fha")) return "FHA";
  if (s.includes("va")) return "VA";
  if (s.includes("usda") || s.includes("rural")) return "USDARural";
  if (s.includes("conv")) return "Conventional";
  return "Other";
}

function mapAmortization(v: unknown): string {
  if (!hasText(v)) return "Fixed";
  const s = v.toLowerCase();
  if (s.includes("arm") || s.includes("adjust")) return "AdjustableRate";
  if (s.includes("i/o") || s.includes("interest")) return "InterestOnly";
  if (s.includes("neg")) return "GraduatedPaymentMortgage";
  return "Fixed";
}

function mapOccupancy(v: unknown, other?: unknown): string {
  if (!hasText(v)) return "Unknown";
  const s = v.toLowerCase();
  if (s.includes("primary")) return "PrimaryResidence";
  if (s.includes("second") || s.includes("2nd")) return "SecondHome";
  if (s.includes("invest") || s.includes("rental")) return "Investment";
  if (hasText(other)) return "Other";
  return "Other";
}

function mapCitizenship(v: unknown): string | null {
  if (!hasText(v)) return null;
  const s = v.toLowerCase();
  if (s.includes("us") && s.includes("citizen")) return "USCitizen";
  if (s.includes("permanent")) return "PermanentResidentAlien";
  if (s.includes("foreign") || s.includes("non")) return "NonPermanentResidentAlien";
  return "Other";
}

function mapYesNo(v: unknown): string | null {
  if (!hasText(v)) return null;
  const s = v.toLowerCase().trim();
  if (["y", "yes", "true", "1"].includes(s)) return "true";
  if (["n", "no", "false", "0"].includes(s)) return "false";
  return null;
}

function mapLoanPositionType(v: unknown): string | null {
  if (!hasText(v)) return null;
  const s = v.toLowerCase();
  if (s.includes("1")) return "FirstLien";
  if (s.includes("2")) return "SecondLien";
  if (s.includes("3")) return "ThirdLien";
  return "OtherLien";
}

/* ============================== Parties ============================== */

function renderBorrowerParty(
  b: NonNullable<Sheet["borrowers"]>[number],
  sheet: Sheet,
  index: number,
  sequenceId: string,
): XmlEl {
  const incomeRows = (sheet.incomeRows ?? []).filter((r) => {
    if (!hasText(r.borrower)) return index === 0; // unspecified → primary
    const n = r.borrower.match(/\d/);
    const bi = n ? Number(n[0]) - 1 : 0;
    return bi === index;
  });

  const employment = el("EMPLOYERS");
  if (hasText(b.employerName)) {
    employment.add(
      el(
        "EMPLOYER",
        {},
        el("LEGAL_ENTITY")
          .add(
            el("LEGAL_ENTITY_DETAIL").leaf(
              "FullName",
              b.employerName,
            ),
          )
          .add(
            hasText(b.employerPhone)
              ? el("CONTACT_POINTS", {}, contactTelephone(b.employerPhone))
              : null,
          ),
        el("EMPLOYMENT").leaf("EmploymentPositionDescription", b.position),
      ),
    );
  }

  const incomes = el("CURRENT_INCOMES");
  for (const [i, row] of incomeRows.entries()) {
    const amt = num(row.monthlyAmount);
    if (amt === null && !hasText(row.source)) continue;
    incomes.add(
      el("CURRENT_INCOME", { SequenceNumber: String(i + 1) }).add(
        el("CURRENT_INCOME_DETAIL")
          .leaf(
            "CurrentIncomeMonthlyTotalAmount",
            amt !== null ? amt.toFixed(2) : null,
          )
          .leaf("EmploymentIncomeIndicator", hasText(row.source) ? "true" : null)
          .leaf(
            "IncomeType",
            mapIncomeType(row.source),
          )
          .leaf("IncomeTypeOtherDescription", hasText(row.description) ? row.description : null),
      ),
    );
  }

  const ssnVal = ssn(b.ssn);
  const birth = isoDate(b.dob);
  const residence = renderBorrowerResidence(sheet);

  const party = el("PARTY", { SequenceNumber: String(index + 1), "xlink:label": sequenceId }).add(
    el("INDIVIDUAL").add(
      el("NAME")
        .leaf("FirstName", b.firstName)
        .leaf("MiddleName", b.middleName)
        .leaf("LastName", b.lastName),
      el("CONTACT_POINTS").add(
        ...buildContactPoints({
          email: b.email,
          mobile: b.mobile,
          home: b.homePhone,
          work: b.altPhone,
        }),
      ),
    ),
    ssnVal
      ? el("TAXPAYER_IDENTIFIERS").add(
          el("TAXPAYER_IDENTIFIER").add(
            el("TaxpayerIdentifierType", {}, "SocialSecurityNumber"),
            el("TaxpayerIdentifierValue", {}, ssnVal),
          ),
        )
      : null,
    el("ROLES").add(
      el("ROLE").add(
        el("BORROWER").add(
          el("BORROWER_DETAIL")
            .leaf("BorrowerBirthDate", birth)
            .leaf(
              "BorrowerClassificationType",
              index === 0 ? "Primary" : "Secondary",
            )
            .leaf(
              "CreditScoreSubjectFirstPartyIdentifier",
              hasText(b.fico) ? b.fico : null,
            ),
          employment,
          incomes,
          residence,
          index === 0 ? renderDeclarations(sheet) : null,
        ),
        el("ROLE_DETAIL").leaf(
          "PartyRoleType",
          "Borrower",
        ),
      ),
    ),
  );

  return party;
}

function mapIncomeType(src: unknown): string | null {
  if (!hasText(src)) return "Base";
  const s = src.toLowerCase();
  if (s.includes("w2") || s.includes("base")) return "Base";
  if (s.includes("1099") || s.includes("self") || s.includes("s-corp") || s.includes("schedule")) return "SelfEmployment";
  if (s.includes("bonus")) return "Bonus";
  if (s.includes("commission")) return "Commission";
  if (s.includes("overtime")) return "Overtime";
  if (s.includes("retire") || s.includes("pension")) return "Pension";
  if (s.includes("social security") || s.includes("ssi")) return "SocialSecurity";
  if (s.includes("rent")) return "RentalIncome";
  if (s.includes("divid") || s.includes("interest")) return "DividendsInterest";
  return "Other";
}

function contactTelephone(v: unknown): XmlEl | null {
  const p = phone(v);
  if (!p) return null;
  return el("CONTACT_POINT").add(
    el("CONTACT_POINT_TELEPHONE").leaf("ContactPointTelephoneValue", p),
    el("CONTACT_POINT_DETAIL").leaf("ContactPointRoleType", "Work"),
  );
}

function buildContactPoints(args: {
  email?: string;
  mobile?: string;
  home?: string;
  work?: string;
}): XmlEl[] {
  const out: XmlEl[] = [];
  if (hasText(args.email)) {
    out.push(
      el("CONTACT_POINT").add(
        el("CONTACT_POINT_EMAIL").leaf("ContactPointEmailValue", args.email),
      ),
    );
  }
  for (const [role, raw] of [
    ["Mobile", args.mobile],
    ["Home", args.home],
    ["Work", args.work],
  ] as const) {
    const p = phone(raw);
    if (!p) continue;
    out.push(
      el("CONTACT_POINT").add(
        el("CONTACT_POINT_TELEPHONE").leaf("ContactPointTelephoneValue", p),
        el("CONTACT_POINT_DETAIL").leaf("ContactPointRoleType", role),
      ),
    );
  }
  return out;
}

function renderBorrowerResidence(sheet: Sheet): XmlEl | null {
  const addr = sheet.primaryProperty;
  if (!addr) return null;
  const res = el("RESIDENCES").add(
    el("RESIDENCE").add(
      el("RESIDENCE_DETAIL")
        .leaf("BorrowerResidencyBasisType", hasText(sheet.occupancy) ? sheet.occupancy : null)
        .leaf("BorrowerResidencyType", "Current"),
      renderAddress(addr),
    ),
  );
  if (res.isEmpty()) return null;
  return res;
}

function renderAddress(p: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): XmlEl | null {
  const hasAny = hasText(p.address) || hasText(p.city) || hasText(p.state) || hasText(p.zip);
  if (!hasAny) return null;
  return el("ADDRESS")
    .leaf("AddressLineText", p.address)
    .leaf("CityName", p.city)
    .leaf("StateCode", p.state ? p.state.toUpperCase() : null)
    .leaf("PostalCode", zip(p.zip));
}

/* ============================== Declarations ============================== */

function renderDeclarations(sheet: Sheet): XmlEl | null {
  const bkYes = mapYesNo(sheet.bkHistory);
  const judgments = mapYesNo(sheet.defaultJudgments);
  const late = num(sheet.latePaymentsLast12);
  const citizenship = mapCitizenship(sheet.citizenship);
  if (bkYes === null && judgments === null && late === null && !citizenship) return null;

  return el("DECLARATION").add(
    el("DECLARATION_DETAIL")
      .leaf("BankruptcyIndicator", bkYes)
      .leaf("OutstandingJudgmentsIndicator", judgments)
      .leaf(
        "PresentlyDelinquentIndicator",
        late !== null && late > 0 ? "true" : late !== null ? "false" : null,
      )
      .leaf("CitizenshipResidencyType", citizenship),
  );
}

/* ============================== Assets & Liabilities ============================== */

function renderAssets(sheet: Sheet): XmlEl | null {
  const rows = (sheet.assets ?? []).filter((a) => hasText(a.description) || num(a.estimatedValue) !== null);
  if (rows.length === 0) return null;
  const assets = el("ASSETS");
  for (const [i, a] of rows.entries()) {
    const amt = num(a.estimatedValue);
    assets.add(
      el("ASSET", { SequenceNumber: String(i + 1) }).add(
        el("ASSET_DETAIL")
          .leaf("AssetAccountIdentifier", hasText(a.description) ? a.description : null)
          .leaf("AssetCashOrMarketValueAmount", amt !== null ? amt.toFixed(2) : null)
          .leaf("AssetType", classifyAsset(a.description)),
      ),
    );
  }
  return assets;
}

function classifyAsset(desc: unknown): string {
  if (!hasText(desc)) return "OtherNonLiquidAsset";
  const s = desc.toLowerCase();
  if (s.includes("check")) return "CheckingAccount";
  if (s.includes("saving")) return "SavingsAccount";
  if (s.includes("money market") || s.includes("mmkt")) return "MoneyMarketFund";
  if (s.includes("cd") || s.includes("certificate")) return "CertificateOfDepositTimeDeposit";
  if (s.includes("401") || s.includes("ira") || s.includes("retire")) return "RetirementFund";
  if (s.includes("stock") || s.includes("brokerage") || s.includes("invest")) return "StocksAndBondsMutualFunds";
  if (s.includes("gift")) return "GiftsTotal";
  if (s.includes("earnest") || s.includes("emd")) return "EarnestMoneyCashDeposit";
  return "OtherLiquidAsset";
}

function renderLiabilities(sheet: Sheet): XmlEl | null {
  const rows = (sheet.liabilities ?? []).filter(
    (l) => hasText(l.description) || num(l.balance) !== null || num(l.monthlyPayment) !== null,
  );
  if (rows.length === 0) return null;
  const libs = el("LIABILITIES");
  for (const [i, l] of rows.entries()) {
    libs.add(
      el("LIABILITY", { SequenceNumber: String(i + 1) }).add(
        el("LIABILITY_DETAIL")
          .leaf("LiabilityDescription", hasText(l.description) ? l.description : null)
          .leaf(
            "LiabilityMonthlyPaymentAmount",
            dec(l.monthlyPayment),
          )
          .leaf("LiabilityUnpaidBalanceAmount", dec(l.balance))
          .leaf("LiabilityType", classifyLiability(l.description)),
      ),
    );
  }
  return libs;
}

function classifyLiability(desc: unknown): string {
  if (!hasText(desc)) return "OtherLiability";
  const s = desc.toLowerCase();
  if (s.includes("revol") || s.includes("credit card") || s.includes("visa") || s.includes("master")) return "Revolving";
  if (s.includes("auto") || s.includes("car")) return "Installment";
  if (s.includes("student")) return "Installment";
  if (s.includes("mortgage") || s.includes("heloc") || s.includes("home equity")) return "MortgageLoan";
  if (s.includes("lease")) return "LeasePayment";
  if (s.includes("child") || s.includes("alimony")) return "ChildSupport";
  return "Installment";
}

/* ============================== REO ============================== */

function renderREOs(sheet: Sheet): XmlEl | null {
  const rows = (sheet.reo ?? []).filter(
    (r) =>
      hasText(r.address) ||
      num(r.marketValue) !== null ||
      num(r.grossRent) !== null,
  );
  if (rows.length === 0) return null;
  const owned = el("OWNED_PROPERTIES");
  for (const [i, r] of rows.entries()) {
    const value = num(r.marketValue);
    const balance = num(r.balance);
    const payment = num(r.mortgagePayment);
    const rent = num(r.grossRent);
    owned.add(
      el("OWNED_PROPERTY", { SequenceNumber: String(i + 1) }).add(
        el("OWNED_PROPERTY_DETAIL")
          .leaf("OwnedPropertyMaintenanceExpenseAmount", dec(r.escrow))
          .leaf(
            "OwnedPropertyRentalIncomeGrossAmount",
            rent !== null ? rent.toFixed(2) : null,
          )
          .leaf(
            "OwnedPropertyDispositionStatusType",
            "RetainForRentalOrInvestment",
          )
          .leaf("PropertyCurrentUsageType", mapREOUsage(r.usage)),
        renderAddress({ address: r.address, state: r.state }),
        el("PROPERTY_VALUATIONS").add(
          el("PROPERTY_VALUATION").add(
            el("PROPERTY_VALUATION_DETAIL").leaf(
              "PropertyValuationAmount",
              value !== null ? value.toFixed(2) : null,
            ),
          ),
        ),
        balance !== null || payment !== null
          ? el("LIABILITIES").add(
              el("LIABILITY", { SequenceNumber: "1" }).add(
                el("LIABILITY_DETAIL")
                  .leaf(
                    "LiabilityMonthlyPaymentAmount",
                    payment !== null ? payment.toFixed(2) : null,
                  )
                  .leaf(
                    "LiabilityUnpaidBalanceAmount",
                    balance !== null ? balance.toFixed(2) : null,
                  )
                  .leaf("LiabilityType", "MortgageLoan"),
              ),
            )
          : null,
      ),
    );
  }
  return owned;
}

function mapREOUsage(v: unknown): string | null {
  if (!hasText(v)) return null;
  const s = v.toLowerCase();
  if (s.includes("primary")) return "PrimaryResidence";
  if (s.includes("rental") || s.includes("invest")) return "Investment";
  if (s.includes("second") || s.includes("2nd")) return "SecondHome";
  if (s.includes("commerc")) return "Investment";
  return "Other";
}

/* ============================== Subject property / loan ============================== */

function renderSubjectProperty(sheet: Sheet): XmlEl {
  const sp = sheet.subjectProperty ?? {};
  const cover = sheet.cover ?? {};
  const value = num(sp.estimatedValue) ?? num(cover.purchasePrice);
  const yearBuilt = int(sp.yearBuilt);
  return el("COLLATERAL", { SequenceNumber: "1" }).add(
    el("SUBJECT_PROPERTY").add(
      renderAddress(sp),
      el("PROPERTY_DETAIL")
        .leaf("ConstructionMethodType", "SiteBuilt")
        .leaf("FinancedNumberOfUnitsCount", "1")
        .leaf(
          "PropertyEstimatedValueAmount",
          value !== null ? value.toFixed(2) : null,
        )
        .leaf("PropertyStructureBuiltYear", yearBuilt)
        .leaf(
          "PropertyUsageType",
          mapOccupancy(sheet.occupancy, sheet.occupancyOther),
        )
        .leaf("PropertyExistingCleanEnergyLienIndicator", "false"),
      value !== null
        ? el("PROPERTY_VALUATIONS").add(
            el("PROPERTY_VALUATION").add(
              el("PROPERTY_VALUATION_DETAIL").leaf(
                "PropertyValuationAmount",
                value.toFixed(2),
              ),
            ),
          )
        : null,
    ),
  );
}

function renderSubjectLoan(sheet: Sheet, firstBorrowerLabel: string): XmlEl {
  const cover = sheet.cover ?? {};
  const scenario = sheet.scenario ?? {};
  const hm = sheet.hardMoney ?? {};

  const fundingAmount =
    num(cover.fundingAmount) ??
    num(scenario.proposedLoanAmount) ??
    num(hm.initialLoan);
  const rate = num(cover.ratePct) ?? num(hm.ratePct);
  const purpose = cover.purpose ?? scenario.loanPurpose;
  const fundingTypeRaw = cover.fundingType ?? scenario.fundingType;
  const termMonths =
    num(hm.termMonths) ?? termMonthsFromYears(scenario.loanTermYears) ?? 360;
  const amortType = mapAmortization(fundingTypeRaw);
  const value =
    num(sheet.subjectProperty?.estimatedValue) ??
    num(cover.purchasePrice) ??
    num(scenario.propertyValue);
  const ltv = value && fundingAmount ? (fundingAmount / value) * 100 : null;

  const loanPurpose = mapLoanPurpose(purpose);
  const cashOut = loanPurpose === "Refinance" ? refinanceCashOut(purpose) : null;
  const mortgageType = mapMortgageType(fundingTypeRaw);

  return el("LOAN", { LoanRoleType: "SubjectLoan", SequenceNumber: "1" }).add(
    el("AMORTIZATION").add(
      el("AMORTIZATION_RULE")
        .leaf("AmortizationType", amortType)
        .leaf(
          "LoanAmortizationPeriodCount",
          termMonths ? String(termMonths) : null,
        )
        .leaf("LoanAmortizationPeriodType", "Month"),
    ),
    el("LOAN_DETAIL")
      .leaf("ApplicationReceivedDate", isoDate(sheet.startDate))
      .leaf("BelowMarketSubordinateFinancingIndicator", "false")
      .leaf("ConstructionLoanIndicator", loanPurpose === "ConstructionOnly" ? "true" : "false")
      .leaf("LienPriorityType", "FirstLien"),
    el("MATURITY").add(
      el("MATURITY_RULE").leaf(
        "LoanMaturityPeriodCount",
        termMonths ? String(termMonths) : null,
      ),
    ),
    cashOut
      ? el("REFINANCE")
          .leaf("RefinanceCashOutDeterminationType", cashOut)
          .leaf(
            "RefinanceCashOutAmount",
            dec(scenario.cashOutAmount) ?? undefined,
          )
      : null,
    el("TERMS_OF_LOAN")
      .leaf(
        "BaseLoanAmount",
        fundingAmount !== null ? fundingAmount.toFixed(2) : null,
      )
      .leaf("LoanPurposeType", loanPurpose)
      .leaf(
        "MortgageType",
        mortgageType,
      )
      .leaf(
        "NoteRatePercent",
        rate !== null ? rate.toFixed(4) : null,
      )
      .leaf(
        "RequestedInterestRatePercent",
        rate !== null ? rate.toFixed(4) : null,
      ),
    ltv !== null
      ? el("LTV").add(
          el("LTV_DETAIL")
            .leaf("BaseLTVRatioPercent", ltv.toFixed(3))
            .leaf("LTVRatioPercent", ltv.toFixed(3)),
        )
      : null,
    el("RELATIONSHIPS").add(
      el("RELATIONSHIP", {
        "xlink:from": "PARTY_SUBJECT_LOAN",
        "xlink:to": firstBorrowerLabel,
        "xlink:arcrole": "urn:fdc:Mismo.org:2009:residential/PARTY_IsVerifiedBy_ROLE",
      }),
    ),
  );
}

/* ============================== Existing loans on subject ============================== */

function renderRelatedLoans(sheet: Sheet): XmlEl[] {
  const out: XmlEl[] = [];
  const existing = (sheet.loans ?? []).filter(
    (l) => num(l.currentBalance) !== null || num(l.currentPI) !== null,
  );
  for (const [i, l] of existing.entries()) {
    const bal = num(l.currentBalance);
    const pay = num(l.currentPI);
    const pos = mapLoanPositionType(l.position) ?? "FirstLien";
    out.push(
      el("LOAN", {
        LoanRoleType: "RelatedLoan",
        SequenceNumber: String(i + 2),
      }).add(
        el("LOAN_DETAIL").leaf("LienPriorityType", pos),
        el("TERMS_OF_LOAN")
          .leaf(
            "BaseLoanAmount",
            dec(l.originalAmount) ?? undefined,
          )
          .leaf(
            "LoanPurposeType",
            mapLoanPurpose(l.purpose),
          )
          .leaf("MortgageType", mapMortgageType(l.type))
          .leaf("NoteRatePercent", dec(l.currentRate, 4) ?? undefined),
        pay !== null || bal !== null
          ? el("CURRENT_INCOMES").add(
              // Not really income — but we also surface payment as Liability above.
            )
          : null,
      ),
    );
  }
  return out;
}

/* ============================== Envelope ============================== */

export function buildFnmaXml(sheet: Sheet): string {
  const now = new Date().toISOString();
  const borrowers = sheet.borrowers ?? [];
  const partyLabels = borrowers.map((_, i) => `PARTY_BORROWER_${i + 1}`);

  const parties = el("PARTIES");
  for (const [i, b] of borrowers.entries()) {
    parties.add(renderBorrowerParty(b, sheet, i, partyLabels[i]));
  }

  // Business / guarantors as non-borrower parties (informational only).
  const guarantors = sheet.guarantors ?? [];
  for (const [i, g] of guarantors.entries()) {
    if (!hasText(g.name)) continue;
    const [first, ...rest] = g.name.trim().split(/\s+/);
    const last = rest.length > 0 ? rest.join(" ") : "";
    parties.add(
      el("PARTY", {
        SequenceNumber: String(borrowers.length + i + 1),
        "xlink:label": `PARTY_GUARANTOR_${i + 1}`,
      }).add(
        el("INDIVIDUAL").add(
          el("NAME").leaf("FirstName", first).leaf("LastName", last),
          el("CONTACT_POINTS").add(
            ...buildContactPoints({ email: g.email, mobile: g.mobile }),
          ),
        ),
        hasText(g.ssn)
          ? el("TAXPAYER_IDENTIFIERS").add(
              el("TAXPAYER_IDENTIFIER").add(
                el("TaxpayerIdentifierType", {}, "SocialSecurityNumber"),
                el("TaxpayerIdentifierValue", {}, ssn(g.ssn) ?? ""),
              ),
            )
          : null,
        el("ROLES").add(
          el("ROLE").add(
            el("ROLE_DETAIL").leaf("PartyRoleType", "Guarantor"),
          ),
        ),
      ),
    );
  }

  // Business entity as a Legal Entity party (for commercial / biz funding deals).
  const biz = sheet.business;
  if (biz && (hasText(biz.legalName) || hasText(biz.ein))) {
    parties.add(
      el("PARTY", {
        SequenceNumber: String(borrowers.length + guarantors.length + 1),
        "xlink:label": "PARTY_BUSINESS",
      }).add(
        el("LEGAL_ENTITY").add(
          el("LEGAL_ENTITY_DETAIL")
            .leaf("FullName", biz.legalName)
            .leaf("OrganizationType", biz.entityType)
            .leaf("OrganizationEstablishedDate", isoDate(biz.formationDate)),
          el("CONTACT_POINTS").add(
            ...buildContactPoints({ mobile: biz.phone }),
          ),
        ),
        hasText(biz.ein)
          ? el("TAXPAYER_IDENTIFIERS").add(
              el("TAXPAYER_IDENTIFIER").add(
                el("TaxpayerIdentifierType", {}, "EmployerIdentificationNumber"),
                el("TaxpayerIdentifierValue", {}, ein(biz.ein) ?? ""),
              ),
            )
          : null,
        el("ROLES").add(
          el("ROLE").add(
            el("ROLE_DETAIL").leaf("PartyRoleType", "NoteHolder"),
          ),
        ),
      ),
    );
  }

  const subjectLoan = renderSubjectLoan(
    sheet,
    partyLabels[0] ?? "PARTY_BORROWER_1",
  );
  const relatedLoans = renderRelatedLoans(sheet);

  const deal = el("DEAL").add(
    el("ASSETS").add(renderAssets(sheet) ?? undefined),
    el("COLLATERALS").add(renderSubjectProperty(sheet)),
    el("LIABILITIES").add(renderLiabilities(sheet) ?? undefined),
    el("LOANS").add(subjectLoan, ...relatedLoans),
    el("PARTIES").add(...parties.children),
    renderREOs(sheet)
      ? el("OWNED_PROPERTY_ITEMS").add(renderREOs(sheet) ?? undefined)
      : null,
  );

  const message = el("MESSAGE", {
    MISMOReferenceModelIdentifier: "3.4.022620160128",
    xmlns: "http://www.mismo.org/residential/2009/schemas",
    "xmlns:xlink": "http://www.w3.org/1999/xlink",
  }).add(
    el("ABOUT_VERSIONS").add(
      el("ABOUT_VERSION")
        .leaf("AboutVersionIdentifier", "FNMA-3.4")
        .leaf("CreatedDatetime", now)
        .leaf("DataVersionIdentifier", "3.4.022620160128")
        .leaf("DataVersionName", "FNMA 3.4 URLA"),
    ),
    el("DEAL_SETS").add(
      el("DEAL_SET", { SequenceNumber: "1" }).add(
        el("DEALS").add(deal),
      ),
    ),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>\n${message.render(0)}\n`;
}

/* ============================== Download ============================== */

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
  return slugify(`${name}-fnma34-${new Date().toISOString().slice(0, 10)}`);
}

export function exportFNMA34(sheet: Sheet) {
  const xml = buildFnmaXml(sheet);
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileBase(sheet)}.xml`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 500);
}
