import type { Doc } from "@/convex/_generated/dataModel";
import { monthlyPayment, parseRate, toNumber } from "./finance";

export type DtiStateInput = NonNullable<Doc<"intakeSheets">["dti"]>;

/**
 * Single source for DTI calculator math (Analysis → DTI). UI reads these values;
 * do not re-derive PITIA / ratios inline in components.
 */
export type DtiDerivedMetrics = {
  grossIncome: number;
  purchasePrice: number;
  downPct: number;
  downAmount: number;
  fundingAmount: number;
  termMonths: number;
  rateAnnual: number;
  pi: number;
  estTaxes: number;
  homeownersInsuranceMonthly: number;
  hoa: number;
  fhaMiMonthly: number;
  pitia: number;
  consumerDebtMonthly: number;
  totalMonthlyDebt: number;
  frontDti: number;
  backDti: number;
};

export function computeDtiMetrics(d: DtiStateInput): DtiDerivedMetrics {
  const incomes = d.incomes ?? [];
  const debts = d.debts ?? {};
  const grossIncome = incomes.reduce((sum, inc) => sum + toNumber(inc.amount), 0);
  const purchasePrice = toNumber(d.purchasePrice);
  const downPct = parseRate(d.downPaymentPct);
  const downAmount = purchasePrice * downPct;
  const fundingAmount =
    toNumber(d.fundingAmount) || Math.max(0, purchasePrice - downAmount);
  const termMonths = toNumber(d.termMonths) || 360;
  const rateAnnual = parseRate(d.interestRate);
  const pi = monthlyPayment(fundingAmount, rateAnnual, termMonths);
  const taxRate = parseRate(d.propertyTaxRate);
  const estTaxes =
    toNumber(d.propertyTaxesMonthly) || (purchasePrice * taxRate) / 12;
  const homeownersInsuranceMonthly = toNumber(d.homeownersInsuranceMonthly);
  const hoa = toNumber(d.hoa);
  const fhaMiMonthly = toNumber(d.fhaMiMonthly);
  const pitia =
    pi + estTaxes + homeownersInsuranceMonthly + hoa + fhaMiMonthly;
  const consumerDebtMonthly =
    toNumber(debts.cars) +
    toNumber(debts.revolving) +
    toNumber(debts.installment) +
    toNumber(debts.other);
  const totalMonthlyDebt = pitia + consumerDebtMonthly;
  const frontDti = grossIncome > 0 ? pitia / grossIncome : 0;
  const backDti = grossIncome > 0 ? totalMonthlyDebt / grossIncome : 0;
  return {
    grossIncome,
    purchasePrice,
    downPct,
    downAmount,
    fundingAmount,
    termMonths,
    rateAnnual,
    pi,
    estTaxes,
    homeownersInsuranceMonthly,
    hoa,
    fhaMiMonthly,
    pitia,
    consumerDebtMonthly,
    totalMonthlyDebt,
    frontDti,
    backDti,
  };
}
