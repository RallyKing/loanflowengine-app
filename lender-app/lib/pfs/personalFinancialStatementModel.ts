/**
 * Personal Financial Statement model — mirrors
 * `5 - Personal Financial Statement.xlsx` (SBA-style PFS).
 *
 * Formula map (spreadsheet → computed fields):
 * - stocksBondsTotal      = Σ (shares × marketValue)           [Page2!G6:G9]
 * - lifeInsuranceCashTotal = Σ life policy cash values          [Page2!D47:E50]
 * - realEstateMarketTotal  = Σ RE present mkt (props A–H)       [Page2!C20:G20 + Section4!C12:G12]
 * - mortgagesOnReTotal     = Σ RE mortgage balances (A–D only)  [Page2!C24:G24]  ← sheet omits E–H
 * - notesPayableCurrentTotal = Σ Section 2 current balances     [Page1!F51:H57]
 * - totalAssets            = Σ asset column inputs + roll-ups   [Page1!E33 = SUM(E17:E32)]
 * - totalLiabilities       = Σ liability column                 [Page1!L31 = SUM(L17:L30)]
 * - netWorth               = totalAssets − totalLiabilities     [Page1!L32 = E33−L31]
 * - liabilitiesSideTotal   = totalAssets                        [Page1!L33 = E33]
 */

export const PFS_STATEMENT_VERSION = 1 as const;

export type PfsMoney = string;

export type PfsHeader = {
  statementDate?: string;
  names?: string;
  businessPhone?: string;
  residenceAddress?: string;
  residencePhone?: string;
  city?: string;
  state?: string;
  zip?: string;
  businessName?: string;
};

/** Page 1 asset column — direct inputs (roll-ups filled by compute). */
export type PfsAssetInputs = {
  cashOnHandAndBanks?: PfsMoney;
  savingsAccounts?: PfsMoney;
  iraOrRetirement?: PfsMoney;
  accountsAndNotesReceivable?: PfsMoney;
  /** Direct override; normally derived from Section 8. */
  lifeInsuranceCashSurrender?: PfsMoney;
  /** Direct override; normally derived from Section 3. */
  stocksAndBonds?: PfsMoney;
  /** Direct override; normally derived from Section 4. */
  realEstate?: PfsMoney;
  automobilePresentValue?: PfsMoney;
  otherPersonalProperty?: PfsMoney;
  otherAssets?: PfsMoney;
};

/** Page 1 liability column — direct inputs (roll-ups filled by compute). */
export type PfsLiabilityInputs = {
  accountsPayable?: PfsMoney;
  /** Direct override; normally derived from Section 2. */
  notesPayableToBanksAndOthers?: PfsMoney;
  installmentAccountAuto?: PfsMoney;
  installmentAccountAutoMonthly?: PfsMoney;
  installmentAccountOther?: PfsMoney;
  installmentAccountOtherMonthly?: PfsMoney;
  loanOnLifeInsurance?: PfsMoney;
  /** Direct override; normally derived from Section 4 (A–D). */
  mortgagesOnRealEstate?: PfsMoney;
  unpaidTaxes?: PfsMoney;
  otherLiabilities?: PfsMoney;
};

export type PfsIncomeSection = {
  salary?: PfsMoney;
  netInvestmentIncome?: PfsMoney;
  realEstateIncome?: PfsMoney;
  otherIncome?: PfsMoney;
  otherIncomeDescription?: string;
};

export type PfsContingentLiabilities = {
  asEndorserOrCoMaker?: PfsMoney;
  legalClaimsAndJudgments?: PfsMoney;
  provisionForFederalIncomeTax?: PfsMoney;
  otherSpecialDebt?: PfsMoney;
};

export type PfsNotePayableRow = {
  noteholderNameAddress?: string;
  originalBalanceOrCreditLimit?: PfsMoney;
  currentBalance?: PfsMoney;
  paymentAmount?: PfsMoney;
  paymentFrequency?: string;
  howSecuredOrCollateral?: string;
};

export type PfsStockBondRow = {
  numberOfShares?: PfsMoney;
  namesOfSecurities?: string;
  cost?: PfsMoney;
  marketValueQuotation?: PfsMoney;
  dateOfQuotation?: string;
  /** Computed: shares × marketValueQuotation when both numeric. */
  totalValue?: PfsMoney;
};

export type PfsRealEstateParcel = {
  key: string;
  typeOfProperty?: string;
  address?: string;
  percentInterest?: string;
  datePurchased?: string;
  originalCost?: PfsMoney;
  presentMarketValue?: PfsMoney;
  lenderNameAddress?: string;
  mortgageAccountNumber?: string;
  mortgageBalance?: PfsMoney;
  monthlyPayment?: PfsMoney;
  rentalIncomeMonthly?: PfsMoney;
  statusOfMortgage?: string;
};

export type PfsLifeInsuranceRow = {
  company?: string;
  faceAmount?: PfsMoney;
  cashValue?: PfsMoney;
  beneficiary?: string;
};

export type PfsSignatureBlock = {
  signature?: string;
  date?: string;
  socialSecurityNo?: string;
};

/**
 * Persisted PFS document under `dealData.pfs` / intake `pfs`.
 * Additive: unknown prior keys (portal notes, totals) are preserved via merge.
 */
export type PersonalFinancialStatement = {
  v: typeof PFS_STATEMENT_VERSION;
  header: PfsHeader;
  assets: PfsAssetInputs;
  liabilities: PfsLiabilityInputs;
  income: PfsIncomeSection;
  contingentLiabilities: PfsContingentLiabilities;
  notesPayable: PfsNotePayableRow[];
  stocksAndBonds: PfsStockBondRow[];
  realEstateOwned: PfsRealEstateParcel[];
  otherPersonalPropertyNotes?: string;
  unpaidTaxesNotes?: string;
  otherLiabilitiesNotes?: string;
  lifeInsurance: PfsLifeInsuranceRow[];
  signatures: [PfsSignatureBlock, PfsSignatureBlock];
  /** Portal / legacy free-text. */
  notes?: string;
  clientPortalNotes?: string;
};

export type PfsComputedTotals = {
  stocksBondsTotal: number;
  lifeInsuranceCashTotal: number;
  realEstateMarketTotal: number;
  mortgagesOnReTotal: number;
  notesPayableCurrentTotal: number;
  /** Effective asset column amounts after applying schedule roll-ups. */
  assetColumn: {
    cashOnHandAndBanks: number;
    savingsAccounts: number;
    iraOrRetirement: number;
    accountsAndNotesReceivable: number;
    lifeInsuranceCashSurrender: number;
    stocksAndBonds: number;
    realEstate: number;
    automobilePresentValue: number;
    otherPersonalProperty: number;
    otherAssets: number;
  };
  liabilityColumn: {
    accountsPayable: number;
    notesPayableToBanksAndOthers: number;
    installmentAccountAuto: number;
    installmentAccountOther: number;
    loanOnLifeInsurance: number;
    mortgagesOnRealEstate: number;
    unpaidTaxes: number;
    otherLiabilities: number;
  };
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  liabilitiesSideTotal: number;
};

export const PFS_RE_PARCEL_KEYS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
] as const;

/** Spreadsheet only rolls mortgage balances for parcels A–D into L25. */
export const PFS_MORTGAGE_ROLLUP_KEYS = new Set(["A", "B", "C", "D"]);

export function parsePfsMoney(raw: string | undefined | null): number {
  if (raw == null) return 0;
  const t = String(raw).trim();
  if (!t || /^n\/?a$/i.test(t)) return 0;
  const n = Number.parseFloat(t.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatPfsMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function emptyParcel(key: string): PfsRealEstateParcel {
  return { key };
}

export function createEmptyPersonalFinancialStatement(): PersonalFinancialStatement {
  return {
    v: PFS_STATEMENT_VERSION,
    header: {},
    assets: {},
    liabilities: {},
    income: {},
    contingentLiabilities: {},
    notesPayable: Array.from({ length: 7 }, () => ({})),
    stocksAndBonds: Array.from({ length: 4 }, () => ({})),
    realEstateOwned: PFS_RE_PARCEL_KEYS.map((key) => emptyParcel(key)),
    lifeInsurance: Array.from({ length: 4 }, () => ({})),
    signatures: [{}, {}],
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  return v;
}

function money(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") return v;
  return undefined;
}

/**
 * Normalize unknown persisted `pfs` (portal summary or full statement) into v1.
 * Preserves legacy summary keys on the returned object via shallow extras in notes.
 */
export function normalizePersonalFinancialStatement(
  raw: unknown,
): PersonalFinancialStatement {
  const base = createEmptyPersonalFinancialStatement();
  const r = asRecord(raw);
  if (!r) return base;

  const header = asRecord(r.header) ?? {};
  const assets = asRecord(r.assets) ?? {};
  const liabilities = asRecord(r.liabilities) ?? {};
  const income = asRecord(r.income) ?? {};
  const contingent = asRecord(r.contingentLiabilities) ?? {};

  // Legacy portal / flat totals → seed asset/liability inputs when nested missing.
  if (!assets.cashOnHandAndBanks && money(r.liquidAssets)) {
    assets.cashOnHandAndBanks = money(r.liquidAssets);
  }

  const notesPayableIn = Array.isArray(r.notesPayable) ? r.notesPayable : [];
  const stocksIn = Array.isArray(r.stocksAndBonds) ? r.stocksAndBonds : [];
  const lifeIn = Array.isArray(r.lifeInsurance) ? r.lifeInsurance : [];
  const reIn = Array.isArray(r.realEstateOwned) ? r.realEstateOwned : [];

  const notesPayable = base.notesPayable.map((row, i) => {
    const src = asRecord(notesPayableIn[i]);
    if (!src) return row;
    return {
      noteholderNameAddress: str(src.noteholderNameAddress),
      originalBalanceOrCreditLimit: money(src.originalBalanceOrCreditLimit),
      currentBalance: money(src.currentBalance),
      paymentAmount: money(src.paymentAmount),
      paymentFrequency: str(src.paymentFrequency),
      howSecuredOrCollateral: str(src.howSecuredOrCollateral),
    };
  });

  const stocksAndBonds = base.stocksAndBonds.map((row, i) => {
    const src = asRecord(stocksIn[i]);
    if (!src) return row;
    return {
      numberOfShares: money(src.numberOfShares),
      namesOfSecurities: str(src.namesOfSecurities),
      cost: money(src.cost),
      marketValueQuotation: money(src.marketValueQuotation),
      dateOfQuotation: str(src.dateOfQuotation),
    };
  });

  const lifeInsurance = base.lifeInsurance.map((row, i) => {
    const src = asRecord(lifeIn[i]);
    if (!src) return row;
    return {
      company: str(src.company),
      faceAmount: money(src.faceAmount),
      cashValue: money(src.cashValue),
      beneficiary: str(src.beneficiary),
    };
  });

  const byKey = new Map<string, Record<string, unknown>>();
  for (const item of reIn) {
    const src = asRecord(item);
    if (!src) continue;
    const key = str(src.key)?.toUpperCase();
    if (key) byKey.set(key, src);
  }
  const realEstateOwned = PFS_RE_PARCEL_KEYS.map((key) => {
    const src = byKey.get(key);
    if (!src) return emptyParcel(key);
    return {
      key,
      typeOfProperty: str(src.typeOfProperty),
      address: str(src.address),
      percentInterest: str(src.percentInterest),
      datePurchased: str(src.datePurchased),
      originalCost: money(src.originalCost),
      presentMarketValue: money(src.presentMarketValue),
      lenderNameAddress: str(src.lenderNameAddress),
      mortgageAccountNumber: str(src.mortgageAccountNumber),
      mortgageBalance: money(src.mortgageBalance),
      monthlyPayment: money(src.monthlyPayment),
      rentalIncomeMonthly: money(src.rentalIncomeMonthly),
      statusOfMortgage: str(src.statusOfMortgage),
    };
  });

  const sigIn = Array.isArray(r.signatures) ? r.signatures : [];
  const signatures: [PfsSignatureBlock, PfsSignatureBlock] = [
    {
      signature: str(asRecord(sigIn[0])?.signature),
      date: str(asRecord(sigIn[0])?.date),
      socialSecurityNo: str(asRecord(sigIn[0])?.socialSecurityNo),
    },
    {
      signature: str(asRecord(sigIn[1])?.signature),
      date: str(asRecord(sigIn[1])?.date),
      socialSecurityNo: str(asRecord(sigIn[1])?.socialSecurityNo),
    },
  ];

  return {
    v: PFS_STATEMENT_VERSION,
    header: {
      statementDate: str(header.statementDate) ?? str(r.statementDate),
      names: str(header.names) ?? str(r.names),
      // Flat fallbacks: older portal summaries / mis-keyed patches.
      businessPhone: str(header.businessPhone) ?? str(r.businessPhone),
      residenceAddress:
        str(header.residenceAddress) ?? str(r.residenceAddress),
      residencePhone: str(header.residencePhone) ?? str(r.residencePhone),
      city: str(header.city) ?? str(r.city),
      state: str(header.state) ?? str(r.state),
      zip: str(header.zip) ?? str(r.zip),
      businessName: str(header.businessName) ?? str(r.businessName),
    },
    assets: {
      cashOnHandAndBanks: money(assets.cashOnHandAndBanks),
      savingsAccounts: money(assets.savingsAccounts),
      iraOrRetirement: money(assets.iraOrRetirement),
      accountsAndNotesReceivable: money(assets.accountsAndNotesReceivable),
      lifeInsuranceCashSurrender: money(assets.lifeInsuranceCashSurrender),
      stocksAndBonds: money(assets.stocksAndBonds),
      realEstate: money(assets.realEstate),
      automobilePresentValue: money(assets.automobilePresentValue),
      otherPersonalProperty: money(assets.otherPersonalProperty),
      otherAssets: money(assets.otherAssets),
    },
    liabilities: {
      accountsPayable: money(liabilities.accountsPayable),
      notesPayableToBanksAndOthers: money(
        liabilities.notesPayableToBanksAndOthers,
      ),
      installmentAccountAuto: money(liabilities.installmentAccountAuto),
      installmentAccountAutoMonthly: money(
        liabilities.installmentAccountAutoMonthly,
      ),
      installmentAccountOther: money(liabilities.installmentAccountOther),
      installmentAccountOtherMonthly: money(
        liabilities.installmentAccountOtherMonthly,
      ),
      loanOnLifeInsurance: money(liabilities.loanOnLifeInsurance),
      mortgagesOnRealEstate: money(liabilities.mortgagesOnRealEstate),
      unpaidTaxes: money(liabilities.unpaidTaxes),
      otherLiabilities: money(liabilities.otherLiabilities),
    },
    income: {
      salary: money(income.salary) ?? money(r.annualIncome),
      netInvestmentIncome: money(income.netInvestmentIncome),
      realEstateIncome: money(income.realEstateIncome),
      otherIncome: money(income.otherIncome),
      otherIncomeDescription: str(income.otherIncomeDescription),
    },
    contingentLiabilities: {
      asEndorserOrCoMaker: money(contingent.asEndorserOrCoMaker),
      legalClaimsAndJudgments: money(contingent.legalClaimsAndJudgments),
      provisionForFederalIncomeTax: money(
        contingent.provisionForFederalIncomeTax,
      ),
      otherSpecialDebt: money(contingent.otherSpecialDebt),
    },
    notesPayable,
    stocksAndBonds,
    realEstateOwned,
    otherPersonalPropertyNotes: str(r.otherPersonalPropertyNotes),
    unpaidTaxesNotes: str(r.unpaidTaxesNotes),
    otherLiabilitiesNotes: str(r.otherLiabilitiesNotes),
    lifeInsurance,
    signatures,
    notes: str(r.notes),
    clientPortalNotes: str(r.clientPortalNotes),
  };
}

/** Legacy portal summary keys stored alongside the structured statement. */
export const PFS_LEGACY_SUMMARY_KEYS = [
  "totalAssets",
  "totalLiabilities",
  "netWorth",
  "liquidAssets",
  "annualIncome",
  "notes",
  "clientPortalNotes",
] as const;

function pickDefinedStringKeys(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const raw = source[key];
    if (typeof raw === "string" && raw.trim() !== "") out[key] = raw;
    else if (typeof raw === "number" && Number.isFinite(raw)) out[key] = String(raw);
  }
  return out;
}

function plainObjectOrEmpty(v: unknown): Record<string, unknown> {
  return asRecord(v) ?? {};
}

function omitUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefinedDeep(item));
  }
  const rec = asRecord(value);
  if (!rec) return value;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(rec)) {
    if (raw === undefined) continue;
    out[key] = omitUndefinedDeep(raw);
  }
  return out;
}

/**
 * Drop corrupted nested shapes from a prior portal bug that assigned legacy
 * asset/liability *row arrays* onto `dealData.pfs.assets` / `.liabilities`.
 */
export function scrubPfsDealDocument(
  raw: unknown,
): Record<string, unknown> {
  const rec = asRecord(raw);
  if (!rec) return {};
  const out = { ...rec };
  if (Array.isArray(out.assets)) delete out.assets;
  if (Array.isArray(out.liabilities)) delete out.liabilities;
  return out;
}

export type PfsPortalDealPatch = {
  pfs: Record<string, unknown>;
  assets?: unknown;
  liabilities?: unknown;
};

/**
 * Build the dealData patch for a client-portal PFS autosave/submit.
 *
 * Portal extract sends `{ pfs: fullStatement, assets?, liabilities? }`.
 * The structured `pfs` object (including `header.residencePhone`) must be
 * merged into `dealData.pfs` — not dropped in favor of summary-only keys.
 * Legacy row arrays belong on top-level `dealData.assets` / `.liabilities`,
 * never nested under `pfs`.
 */
export function buildPfsDealPatchFromPortalSubmission(
  priorPfs: unknown,
  values: Record<string, unknown>,
): PfsPortalDealPatch | null {
  const prior = scrubPfsDealDocument(priorPfs);
  const incomingStructured = asRecord(values.pfs);

  let merged: Record<string, unknown>;

  if (incomingStructured) {
    const incomingHeader = plainObjectOrEmpty(incomingStructured.header);
    const priorHeader = plainObjectOrEmpty(prior.header);
    const combineForNormalize = {
      ...prior,
      ...incomingStructured,
      header: { ...priorHeader, ...incomingHeader },
      assets: {
        ...plainObjectOrEmpty(prior.assets),
        ...plainObjectOrEmpty(incomingStructured.assets),
      },
      liabilities: {
        ...plainObjectOrEmpty(prior.liabilities),
        ...plainObjectOrEmpty(incomingStructured.liabilities),
      },
      income: {
        ...plainObjectOrEmpty(prior.income),
        ...plainObjectOrEmpty(incomingStructured.income),
      },
      contingentLiabilities: {
        ...plainObjectOrEmpty(prior.contingentLiabilities),
        ...plainObjectOrEmpty(incomingStructured.contingentLiabilities),
      },
      notesPayable: Array.isArray(incomingStructured.notesPayable)
        ? incomingStructured.notesPayable
        : prior.notesPayable,
      stocksAndBonds: Array.isArray(incomingStructured.stocksAndBonds)
        ? incomingStructured.stocksAndBonds
        : prior.stocksAndBonds,
      realEstateOwned: Array.isArray(incomingStructured.realEstateOwned)
        ? incomingStructured.realEstateOwned
        : prior.realEstateOwned,
      lifeInsurance: Array.isArray(incomingStructured.lifeInsurance)
        ? incomingStructured.lifeInsurance
        : prior.lifeInsurance,
      signatures: Array.isArray(incomingStructured.signatures)
        ? incomingStructured.signatures
        : prior.signatures,
    };
    const normalized = normalizePersonalFinancialStatement(combineForNormalize);
    merged = {
      ...prior,
      ...incomingStructured,
      ...normalized,
      ...pickDefinedStringKeys(prior, PFS_LEGACY_SUMMARY_KEYS),
      ...pickDefinedStringKeys(values, PFS_LEGACY_SUMMARY_KEYS),
      ...pickDefinedStringKeys(incomingStructured, PFS_LEGACY_SUMMARY_KEYS),
    };
  } else {
    const legacyOnly = pickDefinedStringKeys(values, PFS_LEGACY_SUMMARY_KEYS);
    if (Object.keys(legacyOnly).length === 0 && Object.keys(prior).length === 0) {
      // Still allow top-level legacy row arrays alone.
      if (!Array.isArray(values.assets) && !Array.isArray(values.liabilities)) {
        return null;
      }
    }
    merged = {
      ...prior,
      ...legacyOnly,
    };
    // Seed structured cash from liquidAssets when no nested statement yet.
    if (!asRecord(merged.assets)?.cashOnHandAndBanks && legacyOnly.liquidAssets) {
      const normalized = normalizePersonalFinancialStatement(merged);
      merged = { ...merged, ...normalized };
    }
  }

  const cleaned = omitUndefinedDeep(merged) as Record<string, unknown>;
  if (Object.keys(cleaned).length === 0) return null;

  const patch: PfsPortalDealPatch = { pfs: cleaned };
  if (Array.isArray(values.assets)) patch.assets = values.assets;
  if (Array.isArray(values.liabilities)) patch.liabilities = values.liabilities;
  return patch;
}

/**
 * Seed a statement from legacy freeform intake `assets` / `liabilities` rows
 * when the structured statement is empty.
 */
export function seedPfsFromLegacyAssetLiabilityRows(
  statement: PersonalFinancialStatement,
  assets: ReadonlyArray<{ description?: string; estimatedValue?: string }>,
  liabilities: ReadonlyArray<{
    description?: string;
    monthlyPayment?: string;
    balance?: string;
  }>,
): PersonalFinancialStatement {
  const computed = computePersonalFinancialStatement(statement);
  const hasStructure =
    computed.totalAssets !== 0 ||
    computed.totalLiabilities !== 0 ||
    Boolean(statement.header.names?.trim()) ||
    statement.notesPayable.some((r) => r.currentBalance || r.noteholderNameAddress) ||
    statement.stocksAndBonds.some((r) => r.namesOfSecurities || r.numberOfShares) ||
    statement.realEstateOwned.some((r) => r.address || r.presentMarketValue);

  if (hasStructure) return statement;

  const next = { ...statement, assets: { ...statement.assets } };
  if (assets.length > 0) {
    const total = assets.reduce(
      (s, a) => s + parsePfsMoney(a.estimatedValue),
      0,
    );
    if (total > 0) {
      next.assets.otherAssets = String(Math.round(total));
      next.otherPersonalPropertyNotes = assets
        .map((a) => {
          const d = (a.description ?? "").trim() || "Asset";
          const v = (a.estimatedValue ?? "").trim();
          return v ? `${d}: ${v}` : d;
        })
        .join("\n");
    }
  }
  if (liabilities.length > 0) {
    const total = liabilities.reduce(
      (s, l) => s + parsePfsMoney(l.balance),
      0,
    );
    next.liabilities = { ...next.liabilities };
    if (total > 0) {
      next.liabilities.otherLiabilities = String(Math.round(total));
      next.otherLiabilitiesNotes = liabilities
        .map((l) => {
          const d = (l.description ?? "").trim() || "Liability";
          const bal = (l.balance ?? "").trim();
          const mo = (l.monthlyPayment ?? "").trim();
          return [d, bal && `bal ${bal}`, mo && `${mo}/mo`]
            .filter(Boolean)
            .join(" — ");
        })
        .join("\n");
    }
  }
  return next;
}

/** Page 2 G6:G9 — shares × market quotation. */
export function computeStockBondRowTotal(row: PfsStockBondRow): number {
  return (
    parsePfsMoney(row.numberOfShares) * parsePfsMoney(row.marketValueQuotation)
  );
}

export function computePersonalFinancialStatement(
  statement: PersonalFinancialStatement,
): PfsComputedTotals {
  const stocksBondsTotal = statement.stocksAndBonds.reduce(
    (s, row) => s + computeStockBondRowTotal(row),
    0,
  );
  const lifeInsuranceCashTotal = statement.lifeInsurance.reduce(
    (s, row) => s + parsePfsMoney(row.cashValue),
    0,
  );
  const realEstateMarketTotal = statement.realEstateOwned.reduce(
    (s, p) => s + parsePfsMoney(p.presentMarketValue),
    0,
  );
  const mortgagesOnReTotal = statement.realEstateOwned.reduce((s, p) => {
    if (!PFS_MORTGAGE_ROLLUP_KEYS.has(p.key)) return s;
    return s + parsePfsMoney(p.mortgageBalance);
  }, 0);
  const notesPayableCurrentTotal = statement.notesPayable.reduce(
    (s, row) => s + parsePfsMoney(row.currentBalance),
    0,
  );

  const a = statement.assets;
  const lifeRoll =
    a.lifeInsuranceCashSurrender != null &&
    String(a.lifeInsuranceCashSurrender).trim() !== ""
      ? parsePfsMoney(a.lifeInsuranceCashSurrender)
      : lifeInsuranceCashTotal;
  const stocksRoll =
    a.stocksAndBonds != null && String(a.stocksAndBonds).trim() !== ""
      ? parsePfsMoney(a.stocksAndBonds)
      : stocksBondsTotal;
  const reRoll =
    a.realEstate != null && String(a.realEstate).trim() !== ""
      ? parsePfsMoney(a.realEstate)
      : realEstateMarketTotal;

  const assetColumn = {
    cashOnHandAndBanks: parsePfsMoney(a.cashOnHandAndBanks),
    savingsAccounts: parsePfsMoney(a.savingsAccounts),
    iraOrRetirement: parsePfsMoney(a.iraOrRetirement),
    accountsAndNotesReceivable: parsePfsMoney(a.accountsAndNotesReceivable),
    lifeInsuranceCashSurrender: lifeRoll,
    stocksAndBonds: stocksRoll,
    realEstate: reRoll,
    automobilePresentValue: parsePfsMoney(a.automobilePresentValue),
    otherPersonalProperty: parsePfsMoney(a.otherPersonalProperty),
    otherAssets: parsePfsMoney(a.otherAssets),
  };

  const l = statement.liabilities;
  const notesRoll =
    l.notesPayableToBanksAndOthers != null &&
    String(l.notesPayableToBanksAndOthers).trim() !== ""
      ? parsePfsMoney(l.notesPayableToBanksAndOthers)
      : notesPayableCurrentTotal;
  const mortRoll =
    l.mortgagesOnRealEstate != null &&
    String(l.mortgagesOnRealEstate).trim() !== ""
      ? parsePfsMoney(l.mortgagesOnRealEstate)
      : mortgagesOnReTotal;

  const liabilityColumn = {
    accountsPayable: parsePfsMoney(l.accountsPayable),
    notesPayableToBanksAndOthers: notesRoll,
    installmentAccountAuto: parsePfsMoney(l.installmentAccountAuto),
    installmentAccountOther: parsePfsMoney(l.installmentAccountOther),
    loanOnLifeInsurance: parsePfsMoney(l.loanOnLifeInsurance),
    mortgagesOnRealEstate: mortRoll,
    unpaidTaxes: parsePfsMoney(l.unpaidTaxes),
    otherLiabilities: parsePfsMoney(l.otherLiabilities),
  };

  const totalAssets = Object.values(assetColumn).reduce((s, n) => s + n, 0);
  const totalLiabilities = Object.values(liabilityColumn).reduce(
    (s, n) => s + n,
    0,
  );

  return {
    stocksBondsTotal,
    lifeInsuranceCashTotal,
    realEstateMarketTotal,
    mortgagesOnReTotal,
    notesPayableCurrentTotal,
    assetColumn,
    liabilityColumn,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    liabilitiesSideTotal: totalAssets,
  };
}

/** Derive freeform asset/liability rows for contact dual-write compatibility. */
export function pfsToLegacyAssetLiabilityRows(
  statement: PersonalFinancialStatement,
): {
  assets: Array<{ description: string; estimatedValue: string }>;
  liabilities: Array<{
    description: string;
    monthlyPayment: string;
    balance: string;
  }>;
} {
  const c = computePersonalFinancialStatement(statement);
  const assets = [
    {
      description: "Cash on hands & in Banks",
      estimatedValue: String(c.assetColumn.cashOnHandAndBanks || ""),
    },
    {
      description: "Savings Accounts",
      estimatedValue: String(c.assetColumn.savingsAccounts || ""),
    },
    {
      description: "IRA or Other Retirement Account",
      estimatedValue: String(c.assetColumn.iraOrRetirement || ""),
    },
    {
      description: "Accounts & Notes Receivable",
      estimatedValue: String(c.assetColumn.accountsAndNotesReceivable || ""),
    },
    {
      description: "Life Insurance — Cash Surrender Value",
      estimatedValue: String(c.assetColumn.lifeInsuranceCashSurrender || ""),
    },
    {
      description: "Stocks & Bonds",
      estimatedValue: String(c.assetColumn.stocksAndBonds || ""),
    },
    {
      description: "Real Estate",
      estimatedValue: String(c.assetColumn.realEstate || ""),
    },
    {
      description: "Automobile — Present Value",
      estimatedValue: String(c.assetColumn.automobilePresentValue || ""),
    },
    {
      description: "Other Personal Property",
      estimatedValue: String(c.assetColumn.otherPersonalProperty || ""),
    },
    {
      description: "Other Assets",
      estimatedValue: String(c.assetColumn.otherAssets || ""),
    },
  ].filter((r) => parsePfsMoney(r.estimatedValue) !== 0);

  const liabilities = [
    {
      description: "Accounts Payable",
      monthlyPayment: "",
      balance: String(c.liabilityColumn.accountsPayable || ""),
    },
    {
      description: "Notes Payable to Banks and Others",
      monthlyPayment: "",
      balance: String(c.liabilityColumn.notesPayableToBanksAndOthers || ""),
    },
    {
      description: "Installment Account (Auto)",
      monthlyPayment: statement.liabilities.installmentAccountAutoMonthly ?? "",
      balance: String(c.liabilityColumn.installmentAccountAuto || ""),
    },
    {
      description: "Installment Account (Other)",
      monthlyPayment:
        statement.liabilities.installmentAccountOtherMonthly ?? "",
      balance: String(c.liabilityColumn.installmentAccountOther || ""),
    },
    {
      description: "Loan on Life Insurance",
      monthlyPayment: "",
      balance: String(c.liabilityColumn.loanOnLifeInsurance || ""),
    },
    {
      description: "Mortgages on Real Estate",
      monthlyPayment: "",
      balance: String(c.liabilityColumn.mortgagesOnRealEstate || ""),
    },
    {
      description: "Unpaid Taxes",
      monthlyPayment: "",
      balance: String(c.liabilityColumn.unpaidTaxes || ""),
    },
    {
      description: "Other Liabilities",
      monthlyPayment: "",
      balance: String(c.liabilityColumn.otherLiabilities || ""),
    },
  ].filter((r) => parsePfsMoney(r.balance) !== 0);

  return { assets, liabilities };
}
