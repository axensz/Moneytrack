import type { Account, Transaction } from '../types/finance';
import { SPECIAL_CATEGORIES } from '../config/constants';
import { getAccountReferenceIds } from './accountTransactions';
import { getCreditCardUsedCredit } from './accountStrategies';
import { cardStatementForCycle } from './cardPaymentSchedule';
import { cycleIndexOf, getCycleByIndex } from './creditCycles';
import { ensureDate } from './dateUtils';
import { roundMoney } from './formatters';

export type CreditCardUsageWarningSeverity = 'info' | 'warning' | 'error';
export type CreditCardLimitSource = 'manual' | 'suggested';

export interface CreditCardUsageWarning {
  severity: CreditCardUsageWarningSeverity;
  message: string;
}

export interface CreditCardUsagePlan {
  cardId: string;
  cardName: string;
  creditLimit: number;
  usedCredit: number;
  availableCredit: number;
  manualMonthlyLimit: number;
  suggestedMonthlyLimit: number;
  analysisCycleCount: number;
  analysisBaseline: number;
  monthlyLimit: number;
  monthlyLimitSource: CreditCardLimitSource;
  cycleSpent: number;
  currentStatementTotal: number;
  futureInstallmentTotal: number;
  futureInstallmentCycles: number;
  cycleRemaining: number;
  nextCutoff: Date;
  paymentDueDate: Date;
  daysUntilCutoff: number;
  daysUntilPayment: number;
  creditUsageRatio: number;
  monthlyUsageRatio: number | null;
  canCoverAmount: boolean;
  isRecommended: boolean;
  score: number;
  warnings: CreditCardUsageWarning[];
}

interface BuildCreditCardUsagePlansOptions {
  date?: Date;
  amount?: number;
  usedCreditByCard?: Record<string, number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CURRENT_CYCLE_INDEX = 0;
const HISTORICAL_CYCLES = 6;
const MIN_ANALYSIS_CYCLES = 2;
const HISTORICAL_BUFFER_RATIO = 1.2;
export const CREDIT_UTILIZATION_TARGET_RATIO = 0.3;
const CAP_WARNING_RATIO = 0.8;
const HIGH_CREDIT_USAGE_RATIO = 0.8;
const FUTURE_INSTALLMENT_HORIZON = 12;

const excludedChargeCategories = new Set<string>(SPECIAL_CATEGORIES.adjustmentCategories);

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS));
}

function getUsedCredit(account: Account, transactions: Transaction[], usedCreditByCard?: Record<string, number>): number {
  if (account.id && usedCreditByCard?.[account.id] != null) {
    return Math.max(0, roundMoney(usedCreditByCard[account.id]));
  }
  if (account.usedCredit != null) {
    return Math.max(0, roundMoney(account.usedCredit));
  }
  return getCreditCardUsedCredit(account, transactions);
}

function isCardPurchase(tx: Transaction, cardReferenceIds: Set<string>): boolean {
  if (tx.type !== 'expense') return false;
  if (!cardReferenceIds.has(tx.accountId)) return false;
  if (excludedChargeCategories.has(tx.category)) return false;
  return true;
}

function isCycleCharge(tx: Transaction, cardReferenceIds: Set<string>, cutoffDay: number, purchaseDate: Date): boolean {
  if (!isCardPurchase(tx, cardReferenceIds)) return false;
  return cycleIndexOf(cutoffDay, ensureDate(tx.date), purchaseDate) === CURRENT_CYCLE_INDEX;
}

function cardPurchasesForCard(account: Account, transactions: Transaction[]): Transaction[] {
  const cardReferenceIds = new Set(getAccountReferenceIds(account));
  return transactions.filter((tx) => isCardPurchase(tx, cardReferenceIds));
}

function cycleSpentForCard(account: Account, transactions: Transaction[], purchaseDate: Date): number {
  if (!account.cutoffDay) return 0;
  const cardReferenceIds = new Set(getAccountReferenceIds(account));
  const total = transactions.reduce((sum, tx) => (
    isCycleCharge(tx, cardReferenceIds, account.cutoffDay!, purchaseDate) ? sum + tx.amount : sum
  ), 0);
  return roundMoney(total);
}

function currentStatementTotalForCard(account: Account, charges: Transaction[], purchaseDate: Date): number {
  if (!account.cutoffDay) return 0;
  return cardStatementForCycle(account.cutoffDay, CURRENT_CYCLE_INDEX, charges, purchaseDate).total;
}

function futureInstallmentLoadForCard(
  account: Account,
  charges: Transaction[],
  purchaseDate: Date,
): { total: number; cycles: number } {
  if (!account.cutoffDay) return { total: 0, cycles: 0 };

  let total = 0;
  let cycles = 0;
  for (let index = 1; index <= FUTURE_INSTALLMENT_HORIZON; index++) {
    const statement = cardStatementForCycle(account.cutoffDay, index, charges, purchaseDate).total;
    if (statement <= 0) continue;
    total += statement;
    cycles++;
  }

  return { total: roundMoney(total), cycles };
}

function historicalCycleTotalsForCard(account: Account, transactions: Transaction[], purchaseDate: Date): number[] {
  if (!account.cutoffDay) return [];
  const cardReferenceIds = new Set(getAccountReferenceIds(account));
  const totals = new Map<number, number>();

  for (const tx of transactions) {
    if (!isCardPurchase(tx, cardReferenceIds)) continue;
    const index = cycleIndexOf(account.cutoffDay, ensureDate(tx.date), purchaseDate);
    if (index >= 0 || index < -HISTORICAL_CYCLES) continue;
    totals.set(index, (totals.get(index) ?? 0) + tx.amount);
  }

  return Array.from(totals.values())
    .map((value) => roundMoney(value))
    .filter((value) => value > 0);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return roundMoney((sorted[middle - 1] + sorted[middle]) / 2);
}

function buildSuggestedLimitBasis(
  creditLimit: number,
  historicalTotals: number[],
): { preLiquidityLimit: number; baseline: number; cycleCount: number } {
  if (creditLimit <= 0) return { preLiquidityLimit: 0, baseline: 0, cycleCount: historicalTotals.length };
  if (historicalTotals.length < MIN_ANALYSIS_CYCLES) {
    return { preLiquidityLimit: 0, baseline: 0, cycleCount: historicalTotals.length };
  }

  const baseline = median(historicalTotals);
  const historicalLimit = baseline * HISTORICAL_BUFFER_RATIO;
  const utilizationLimit = creditLimit * CREDIT_UTILIZATION_TARGET_RATIO;

  return {
    preLiquidityLimit: roundMoney(Math.min(creditLimit, historicalLimit, utilizationLimit)),
    baseline,
    cycleCount: historicalTotals.length,
  };
}

function buildWarnings(plan: Omit<CreditCardUsagePlan, 'isRecommended' | 'warnings' | 'score'>, amount: number): CreditCardUsageWarning[] {
  const warnings: CreditCardUsageWarning[] = [];
  const projectedUsed = plan.usedCredit + amount;
  const projectedCycleSpent = plan.cycleSpent + amount;
  const projectedCycleLoad = plan.currentStatementTotal + amount;
  const limitLabel = plan.monthlyLimitSource === 'manual' ? 'definido' : 'sugerido';

  if (amount > 0 && amount > plan.availableCredit) {
    warnings.push({
      severity: 'error',
      message: 'No alcanza el cupo disponible para esta compra.',
    });
  }

  if (plan.monthlyLimit > 0) {
    const projectedRatio = projectedCycleLoad / plan.monthlyLimit;
    if (projectedRatio > 1) {
      warnings.push({
        severity: 'error',
        message: `Supera el tope mensual ${limitLabel} para esta tarjeta.`,
      });
    } else if (projectedRatio >= CAP_WARNING_RATIO) {
      warnings.push({
        severity: 'warning',
        message: `Esta tarjeta queda por encima del 80% de su tope mensual ${limitLabel}.`,
      });
    }
  }

  if (
    plan.manualMonthlyLimit > 0 &&
    plan.suggestedMonthlyLimit > 0 &&
    plan.manualMonthlyLimit > plan.suggestedMonthlyLimit &&
    projectedCycleSpent > plan.suggestedMonthlyLimit
  ) {
    warnings.push({
      severity: 'warning',
      message: 'Tu tope manual permite más gasto que el recomendado por utilización y liquidez.',
    });
  }

  if (plan.creditLimit > 0 && projectedUsed / plan.creditLimit > CREDIT_UTILIZATION_TARGET_RATIO) {
    warnings.push({
      severity: 'warning',
      message: 'El uso total de la tarjeta supera el 30% recomendado del cupo.',
    });
  }

  if (plan.creditLimit > 0 && projectedUsed / plan.creditLimit >= HIGH_CREDIT_USAGE_RATIO) {
    warnings.push({
      severity: 'warning',
      message: 'El cupo usado queda por encima del 80% del límite.',
    });
  }

  if (plan.futureInstallmentTotal > 0) {
    const futureLoadRatio = plan.monthlyLimit > 0
      ? plan.futureInstallmentTotal / plan.monthlyLimit
      : plan.creditLimit > 0
        ? plan.futureInstallmentTotal / plan.creditLimit
        : 0;
    warnings.push({
      severity: futureLoadRatio >= CAP_WARNING_RATIO ? 'warning' : 'info',
      message: 'Tiene cuotas futuras pendientes; se descuentan al recomendar la tarjeta.',
    });
  }

  if (amount > 0 && plan.daysUntilCutoff <= 2) {
    warnings.push({
      severity: 'info',
      message: 'La compra cae muy cerca del corte; tendrás menos margen antes del pago.',
    });
  }

  if (plan.manualMonthlyLimit <= 0 && plan.suggestedMonthlyLimit <= 0) {
    warnings.push({
      severity: 'info',
      message: 'Aún no hay suficiente historial para recomendar esta tarjeta automáticamente.',
    });
  }

  return warnings;
}

function isRecommendationEligible(plan: Omit<CreditCardUsagePlan, 'isRecommended' | 'warnings'>): boolean {
  return plan.canCoverAmount && plan.monthlyLimit > 0 && plan.creditUsageRatio < HIGH_CREDIT_USAGE_RATIO;
}

export function buildCreditCardUsagePlans(
  accounts: Account[],
  transactions: Transaction[],
  options: BuildCreditCardUsagePlansOptions = {},
): CreditCardUsagePlan[] {
  const purchaseDate = options.date ?? new Date();
  const amount = Math.max(0, roundMoney(options.amount ?? 0));
  const creditAccounts = accounts.filter((account) => account.type === 'credit' && account.id && account.cutoffDay && account.paymentDay);
  const analysisInputs = creditAccounts.map((account) => ({
    account,
    manualMonthlyLimit: Math.max(0, roundMoney(account.monthlySpendingLimit || 0)),
    historicalTotals: historicalCycleTotalsForCard(account, transactions, purchaseDate),
  }));
  const inputsWithBasis = analysisInputs.map((input) => ({
    ...input,
    suggestedBasis: buildSuggestedLimitBasis(Math.max(0, input.account.creditLimit || 0), input.historicalTotals),
  }));

  const plans = inputsWithBasis
    .map(({ account, manualMonthlyLimit, suggestedBasis }) => {
      const creditLimit = Math.max(0, account.creditLimit || 0);
      const usedCredit = getUsedCredit(account, transactions, options.usedCreditByCard);
      const availableCredit = Math.max(0, roundMoney(creditLimit - usedCredit));
      const suggestedMonthlyLimit = suggestedBasis.preLiquidityLimit;
      const monthlyLimit = manualMonthlyLimit > 0 ? manualMonthlyLimit : suggestedMonthlyLimit;
      const monthlyLimitSource: CreditCardLimitSource = manualMonthlyLimit > 0 ? 'manual' : 'suggested';
      const cycleSpent = cycleSpentForCard(account, transactions, purchaseDate);
      const charges = cardPurchasesForCard(account, transactions);
      const currentStatementTotal = currentStatementTotalForCard(account, charges, purchaseDate);
      const futureInstallmentLoad = futureInstallmentLoadForCard(account, charges, purchaseDate);
      const cycleRemaining = monthlyLimit > 0
        ? Math.max(0, roundMoney(monthlyLimit - currentStatementTotal))
        : availableCredit;
      const cycle = getCycleByIndex(account.cutoffDay!, account.paymentDay!, CURRENT_CYCLE_INDEX, purchaseDate);
      const projectedUsed = usedCredit + amount;
      const projectedCycleSpent = cycleSpent + amount;
      const projectedCycleLoad = currentStatementTotal + amount;
      const creditUsageRatio = creditLimit > 0 ? projectedUsed / creditLimit : 1;
      const monthlyUsageRatio = monthlyLimit > 0 ? projectedCycleLoad / monthlyLimit : null;
      const canCoverAmount = amount <= availableCredit && (monthlyLimit <= 0 || projectedCycleLoad <= monthlyLimit);

      const basePlan = {
        cardId: account.id!,
        cardName: account.name,
        creditLimit,
        usedCredit,
        availableCredit,
        manualMonthlyLimit,
        suggestedMonthlyLimit,
        analysisCycleCount: suggestedBasis.cycleCount,
        analysisBaseline: suggestedBasis.baseline,
        monthlyLimit,
        monthlyLimitSource,
        cycleSpent,
        currentStatementTotal,
        futureInstallmentTotal: futureInstallmentLoad.total,
        futureInstallmentCycles: futureInstallmentLoad.cycles,
        cycleRemaining,
        nextCutoff: cycle.cycleEnd,
        paymentDueDate: cycle.paymentDueDate,
        daysUntilCutoff: daysBetween(purchaseDate, cycle.cycleEnd),
        daysUntilPayment: daysBetween(purchaseDate, cycle.paymentDueDate),
        creditUsageRatio,
        monthlyUsageRatio,
        canCoverAmount,
      };

      const capPenalty = monthlyUsageRatio == null ? 0 : Math.max(0, monthlyUsageRatio - CAP_WARNING_RATIO) * 90;
      const suggestedLimitPenalty = suggestedMonthlyLimit > 0
        ? Math.max(0, (projectedCycleSpent / suggestedMonthlyLimit) - 1) * 90
        : 0;
      const totalUsagePenalty = creditUsageRatio * 160;
      const utilizationPenalty = Math.max(0, creditUsageRatio - CREDIT_UTILIZATION_TARGET_RATIO) * 180;
      const currentStatementPenalty = monthlyLimit > 0
        ? (currentStatementTotal / monthlyLimit) * 50
        : (creditLimit > 0 ? (currentStatementTotal / creditLimit) * 80 : 0);
      const futureInstallmentPenalty = monthlyLimit > 0
        ? (futureInstallmentLoad.total / monthlyLimit) * 140
        : (creditLimit > 0 ? (futureInstallmentLoad.total / creditLimit) * 220 : 0);
      const unavailablePenalty = canCoverAmount ? 0 : 500;
      const score = roundMoney(
        basePlan.daysUntilPayment * 4 +
        basePlan.daysUntilCutoff * 2 +
        (creditLimit > 0 ? (availableCredit / creditLimit) * 40 : 0) -
        capPenalty -
        suggestedLimitPenalty -
        totalUsagePenalty -
        utilizationPenalty -
        currentStatementPenalty -
        futureInstallmentPenalty -
        unavailablePenalty
      );

      return {
        ...basePlan,
        score,
        isRecommended: false,
        warnings: buildWarnings(basePlan, amount),
      };
    })
    .sort((a, b) => b.score - a.score);

  const recommended = plans.find((plan) => isRecommendationEligible(plan)) ?? null;
  return plans.map((plan) => ({ ...plan, isRecommended: plan.cardId === recommended?.cardId }));
}

export function getRecommendedCreditCardUsagePlan(plans: CreditCardUsagePlan[]): CreditCardUsagePlan | null {
  return plans.find((plan) => plan.isRecommended) ?? null;
}
