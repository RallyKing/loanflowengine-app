import { v } from "convex/values";

/** Structured Personal Financial Statement (SBA-style spreadsheet model). */
export const personalFinancialStatementV = v.object({
  v: v.literal(1),
  header: v.optional(
    v.object({
      statementDate: v.optional(v.string()),
      names: v.optional(v.string()),
      businessPhone: v.optional(v.string()),
      residenceAddress: v.optional(v.string()),
      residencePhone: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zip: v.optional(v.string()),
      businessName: v.optional(v.string()),
    }),
  ),
  assets: v.optional(
    v.object({
      cashOnHandAndBanks: v.optional(v.string()),
      savingsAccounts: v.optional(v.string()),
      iraOrRetirement: v.optional(v.string()),
      accountsAndNotesReceivable: v.optional(v.string()),
      lifeInsuranceCashSurrender: v.optional(v.string()),
      stocksAndBonds: v.optional(v.string()),
      realEstate: v.optional(v.string()),
      automobilePresentValue: v.optional(v.string()),
      otherPersonalProperty: v.optional(v.string()),
      otherAssets: v.optional(v.string()),
    }),
  ),
  liabilities: v.optional(
    v.object({
      accountsPayable: v.optional(v.string()),
      notesPayableToBanksAndOthers: v.optional(v.string()),
      installmentAccountAuto: v.optional(v.string()),
      installmentAccountAutoMonthly: v.optional(v.string()),
      installmentAccountOther: v.optional(v.string()),
      installmentAccountOtherMonthly: v.optional(v.string()),
      loanOnLifeInsurance: v.optional(v.string()),
      mortgagesOnRealEstate: v.optional(v.string()),
      unpaidTaxes: v.optional(v.string()),
      otherLiabilities: v.optional(v.string()),
    }),
  ),
  income: v.optional(
    v.object({
      salary: v.optional(v.string()),
      netInvestmentIncome: v.optional(v.string()),
      realEstateIncome: v.optional(v.string()),
      otherIncome: v.optional(v.string()),
      otherIncomeDescription: v.optional(v.string()),
    }),
  ),
  contingentLiabilities: v.optional(
    v.object({
      asEndorserOrCoMaker: v.optional(v.string()),
      legalClaimsAndJudgments: v.optional(v.string()),
      provisionForFederalIncomeTax: v.optional(v.string()),
      otherSpecialDebt: v.optional(v.string()),
    }),
  ),
  notesPayable: v.optional(
    v.array(
      v.object({
        noteholderNameAddress: v.optional(v.string()),
        originalBalanceOrCreditLimit: v.optional(v.string()),
        currentBalance: v.optional(v.string()),
        paymentAmount: v.optional(v.string()),
        paymentFrequency: v.optional(v.string()),
        howSecuredOrCollateral: v.optional(v.string()),
      }),
    ),
  ),
  stocksAndBonds: v.optional(
    v.array(
      v.object({
        numberOfShares: v.optional(v.string()),
        namesOfSecurities: v.optional(v.string()),
        cost: v.optional(v.string()),
        marketValueQuotation: v.optional(v.string()),
        dateOfQuotation: v.optional(v.string()),
        totalValue: v.optional(v.string()),
      }),
    ),
  ),
  realEstateOwned: v.optional(
    v.array(
      v.object({
        key: v.string(),
        typeOfProperty: v.optional(v.string()),
        address: v.optional(v.string()),
        percentInterest: v.optional(v.string()),
        datePurchased: v.optional(v.string()),
        originalCost: v.optional(v.string()),
        presentMarketValue: v.optional(v.string()),
        lenderNameAddress: v.optional(v.string()),
        mortgageAccountNumber: v.optional(v.string()),
        mortgageBalance: v.optional(v.string()),
        monthlyPayment: v.optional(v.string()),
        rentalIncomeMonthly: v.optional(v.string()),
        statusOfMortgage: v.optional(v.string()),
      }),
    ),
  ),
  otherPersonalPropertyNotes: v.optional(v.string()),
  unpaidTaxesNotes: v.optional(v.string()),
  otherLiabilitiesNotes: v.optional(v.string()),
  lifeInsurance: v.optional(
    v.array(
      v.object({
        company: v.optional(v.string()),
        faceAmount: v.optional(v.string()),
        cashValue: v.optional(v.string()),
        beneficiary: v.optional(v.string()),
      }),
    ),
  ),
  signatures: v.optional(
    v.array(
      v.object({
        signature: v.optional(v.string()),
        date: v.optional(v.string()),
        socialSecurityNo: v.optional(v.string()),
      }),
    ),
  ),
  notes: v.optional(v.string()),
  clientPortalNotes: v.optional(v.string()),
  /** Legacy portal summary fields — kept additive. */
  totalAssets: v.optional(v.string()),
  totalLiabilities: v.optional(v.string()),
  netWorth: v.optional(v.string()),
  liquidAssets: v.optional(v.string()),
  annualIncome: v.optional(v.string()),
});
