import type { RecurringPayment, Transaction } from '../types/finance';
import { cleanMerchantForAnalysis, normalizeMerchant } from './autoConfirmImport';
import {
  classifyBudgetCategory,
  isFixedBudgetCategory,
  isRealBudgetTransaction,
  type BudgetCategoryGroup,
} from './budgetPlanning';

export interface AccountPlanSnapshot {
  id: string;
  name: string;
  type: 'savings' | 'credit' | 'cash';
  balance: number;
  creditLimit?: number;
  creditUsed?: number;
  interestRate?: number;
  archived?: boolean;
}

export interface IncomeInsight {
  declaredIncome: number;
  detectedMonthlyIncome: number;
  delta: number;
  deltaPct: number;
  direction: 'higher' | 'lower';
  basisLabel: string;
}

export interface AccountLiquidityRisk {
  accountId: string;
  accountName: string;
  availableBalance: number;
  pendingRecurringAmount: number;
  shortfall: number;
  nextDueDays: number;
  paymentNames: string[];
}

export interface AccountWantsLeak {
  accountId: string;
  accountName: string;
  wantsSpent: number;
  txCount: number;
  shareOfWantsPct: number;
  topCategory: string;
}

export interface PriorityCreditCardInsight {
  accountId: string;
  accountName: string;
  used: number;
  limit: number;
  utilizationRatio: number;
  interestRate: number;
  suggestedPaydownToHealthy: number;
  reason: 'high-utilization' | 'high-interest' | 'active-balance';
}

export interface AccountPlanInsights {
  liquidityRisks: AccountLiquidityRisk[];
  topWantsLeakAccount: AccountWantsLeak | null;
  priorityCreditCard: PriorityCreditCardInsight | null;
}

export interface DetectedSubscription {
  key: string;
  merchant: string;
  category: string;
  estimatedAmount: number;
  monthsDetected: number;
  accountId: string;
  accountName?: string;
  typicalDayOfMonth: number;
}

export interface CategoryTrendInsight {
  category: string;
  group: BudgetCategoryGroup;
  ewmaSpent: number;
  simpleAvgSpent: number;
  trend: 'rising' | 'stable' | 'falling';
  trendSlopePct: number;
  isFixed: boolean;
}

const EWMA_ALPHA = 0.4;

/**
 * Calcula la Media Móvil Exponencial (EWMA) normalizada sobre una serie ordenada
 * cronológicamente (del mes más antiguo al más reciente).
 * Si todos los valores son iguales o solo hay un punto, coincide con el promedio.
 */
export function computeNormalizedEwma(values: readonly number[], alpha = EWMA_ALPHA): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  let weightedSum = 0;
  let weightTotal = 0;
  const n = values.length;
  for (let i = 0; i < n; i++) {
    // El último elemento (i = n - 1) tiene peso 1; los anteriores decaen con (1 - alpha)^(n - 1 - i)
    const weight = Math.pow(1 - alpha, n - 1 - i);
    weightedSum += values[i] * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/**
 * Atenúa valores atípicos extremos (p. ej. una urgencia médica o viaje único)
 * cuando hay al menos 3 meses de historia para no distorsionar la base habitual.
 */
export function dampenOutliers(values: readonly number[]): number[] {
  if (values.length < 3) return [...values];
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  if (median <= 0) return [...values];
  const cap = median * 2.2;
  return values.map(v => (v > cap ? median + (v - median) * 0.35 : v));
}

/**
 * Detecta si los ingresos reales registrados difieren significativamente (>= 10%)
 * del sueldo declarado, para sugerir actualizar la base del plan con un clic.
 */
export function detectIncomeInsight(input: {
  declaredIncome: number;
  completedRealIncomes: readonly number[];
  currentMonthRealIncome: number;
}): IncomeInsight | null {
  const { declaredIncome, completedRealIncomes, currentMonthRealIncome } = input;
  if (!declaredIncome || declaredIncome <= 0) return null;

  const nonZeroCompleted = completedRealIncomes.filter(v => v > 0);
  let detectedRaw = 0;
  let basisLabel = '';

  if (nonZeroCompleted.length > 0) {
    detectedRaw = computeNormalizedEwma(nonZeroCompleted);
    basisLabel = nonZeroCompleted.length === 1
      ? 'según tu último mes cerrado con ingresos'
      : `según tus últimos ${nonZeroCompleted.length} meses de ingresos reales`;
  } else if (currentMonthRealIncome > declaredIncome * 1.1) {
    detectedRaw = currentMonthRealIncome;
    basisLabel = 'según tus ingresos registrados este mes';
  } else {
    return null;
  }

  const detectedMonthlyIncome = Math.round(detectedRaw / 1000) * 1000;
  if (detectedMonthlyIncome <= 0) return null;

  const delta = detectedMonthlyIncome - declaredIncome;
  const deltaPct = Math.round((Math.abs(delta) / declaredIncome) * 100);
  if (deltaPct < 10) return null;

  return {
    declaredIncome,
    detectedMonthlyIncome,
    delta,
    deltaPct,
    direction: delta > 0 ? 'higher' : 'lower',
    basisLabel,
  };
}

/**
 * Analiza riesgos de liquidez por cuenta, fuga en gastos discrecionales ("gustos")
 * y tarjeta de crédito prioritaria a reducir.
 */
export function buildAccountPlanInsights(input: {
  accounts: readonly AccountPlanSnapshot[];
  pendingRecurringItems: ReadonlyArray<{
    id: string;
    name: string;
    amount: number;
    daysUntilDue: number;
    accountId?: string;
  }>;
  expenseTransactions: readonly Transaction[];
  monthsForAvg: number;
}): AccountPlanInsights {
  const { accounts, pendingRecurringItems, expenseTransactions, monthsForAvg } = input;
  const activeAccounts = accounts.filter(a => !a.archived && a.id);
  const accountById = new Map(activeAccounts.map(a => [a.id, a]));

  // 1. Riesgo de liquidez por cuenta líquida frente a pagos recurrentes pendientes del mes
  const pendingByAccount = new Map<
    string,
    { amount: number; nextDueDays: number; names: string[] }
  >();
  for (const item of pendingRecurringItems) {
    if (!item.accountId) continue;
    const acc = accountById.get(item.accountId);
    if (!acc || acc.type === 'credit') continue;
    const current = pendingByAccount.get(acc.id) ?? {
      amount: 0,
      nextDueDays: item.daysUntilDue,
      names: [],
    };
    current.amount += item.amount;
    current.nextDueDays = Math.min(current.nextDueDays, item.daysUntilDue);
    current.names.push(item.name);
    pendingByAccount.set(acc.id, current);
  }

  const liquidityRisks: AccountLiquidityRisk[] = [];
  for (const [accountId, pending] of pendingByAccount.entries()) {
    const acc = accountById.get(accountId);
    if (!acc) continue;
    const availableBalance = Math.max(0, acc.balance);
    if (pending.amount > availableBalance) {
      liquidityRisks.push({
        accountId,
        accountName: acc.name,
        availableBalance,
        pendingRecurringAmount: pending.amount,
        shortfall: pending.amount - availableBalance,
        nextDueDays: pending.nextDueDays,
        paymentNames: pending.names,
      });
    }
  }
  liquidityRisks.sort((a, b) => a.nextDueDays - b.nextDueDays || b.shortfall - a.shortfall);

  // 2. Cuenta con mayor fuga en gustos (wants)
  const wantsByAccount = new Map<
    string,
    { total: number; count: number; byCat: Map<string, number> }
  >();
  let totalWants = 0;

  for (const tx of expenseTransactions) {
    if (classifyBudgetCategory(tx.category) !== 'want') continue;
    totalWants += tx.amount;
    const acc = accountById.get(tx.accountId);
    if (!acc) continue;
    const entry = wantsByAccount.get(acc.id) ?? {
      total: 0,
      count: 0,
      byCat: new Map<string, number>(),
    };
    entry.total += tx.amount;
    entry.count += 1;
    entry.byCat.set(tx.category, (entry.byCat.get(tx.category) ?? 0) + tx.amount);
    wantsByAccount.set(acc.id, entry);
  }

  let topWantsLeakAccount: AccountWantsLeak | null = null;
  const divisor = Math.max(1, monthsForAvg);
  for (const [accountId, data] of wantsByAccount.entries()) {
    const acc = accountById.get(accountId);
    if (!acc || data.total <= 0) continue;
    const monthlyWants = data.total / divisor;
    if (!topWantsLeakAccount || monthlyWants > topWantsLeakAccount.wantsSpent) {
      let topCategory = 'Otros';
      let topCatAmount = -1;
      for (const [cat, amt] of data.byCat.entries()) {
        if (amt > topCatAmount) {
          topCatAmount = amt;
          topCategory = cat;
        }
      }
      topWantsLeakAccount = {
        accountId,
        accountName: acc.name,
        wantsSpent: monthlyWants,
        txCount: data.count,
        shareOfWantsPct: totalWants > 0 ? Math.round((data.total / totalWants) * 100) : 100,
        topCategory,
      };
    }
  }

  // 3. Tarjeta de crédito prioritaria (Método Avalancha / Umbral sano del 30%)
  const creditCards = activeAccounts.filter(
    a => a.type === 'credit' && (a.creditUsed ?? 0) > 0,
  );
  let priorityCreditCard: PriorityCreditCardInsight | null = null;
  let bestCardScore = -1;

  for (const card of creditCards) {
    const used = card.creditUsed ?? 0;
    const limit = card.creditLimit ?? 0;
    const ratio = limit > 0 ? used / limit : 0;
    const rate = card.interestRate ?? 0;
    // Priorizar tarjetas que superan el 30% de utilización o tienen tasa de interés alta
    const score = (ratio > 0.3 ? ratio * 100 : ratio * 25) + rate * 1.5;
    if (score > bestCardScore) {
      bestCardScore = score;
      const healthyTarget = limit > 0 ? limit * 0.3 : 0;
      const suggestedPaydownToHealthy = limit > 0
        ? Math.max(0, Math.round(used - healthyTarget))
        : used;
      const reason: PriorityCreditCardInsight['reason'] =
        ratio > 0.3
          ? 'high-utilization'
          : rate >= 20
            ? 'high-interest'
            : 'active-balance';
      priorityCreditCard = {
        accountId: card.id,
        accountName: card.name,
        used,
        limit,
        utilizationRatio: ratio,
        interestRate: rate,
        suggestedPaydownToHealthy,
        reason,
      };
    }
  }

  return {
    liquidityRisks,
    topWantsLeakAccount,
    priorityCreditCard,
  };
}

/**
 * Detecta posibles suscripciones o cobros periódicos ocultos en el historial:
 * comercios que se cobran en al menos 2 meses distintos con montos consistentes
 * (variación <= 15%) y que aún no están registrados en `recurringPayments`.
 */
export function detectHiddenSubscriptions(input: {
  transactions: readonly Transaction[];
  recurringPayments: readonly RecurringPayment[];
  accounts?: readonly AccountPlanSnapshot[];
}): DetectedSubscription[] {
  const { transactions, recurringPayments, accounts = [] } = input;
  const activeRecurringNames = new Set(
    recurringPayments
      .filter(rp => rp.isActive)
      .map(rp => cleanMerchantForAnalysis(rp.name))
      .filter(Boolean),
  );
  const accountNameById = new Map(accounts.map(a => [a.id, a.name]));

  const groups = new Map<
    string,
    {
      displayMerchant: string;
      category: string;
      accountId: string;
      months: Map<string, { amount: number; day: number; dateMs: number }>;
    }
  >();

  for (const tx of transactions) {
    if (!isRealBudgetTransaction(tx) || tx.type !== 'expense') continue;
    if (tx.recurringPaymentId) continue;
    const rawDesc = tx.description?.trim() ?? '';
    if (!rawDesc) continue;
    const cleaned = cleanMerchantForAnalysis(rawDesc);
    if (!cleaned || cleaned.length < 3) continue;

    // Si ya coincide con un pago periódico activo, omitir
    const matchesExistingRecurring = Array.from(activeRecurringNames).some(
      rpName => rpName === cleaned || cleaned.includes(rpName) || rpName.includes(cleaned),
    );
    if (matchesExistingRecurring) continue;

    const d = new Date(tx.date);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const entry = groups.get(cleaned) ?? {
      displayMerchant: rawDesc,
      category: tx.category,
      accountId: tx.accountId,
      months: new Map(),
    };

    const existingMonth = entry.months.get(ym);
    if (existingMonth) {
      // Si hay múltiples compras el mismo mes en el mismo comercio (ej. supermercado
      // o transporte cotidiano), marcamos con -1 para descartarlo como suscripción mensual.
      entry.months.set(ym, { amount: -1, day: existingMonth.day, dateMs: d.getTime() });
    } else {
      entry.months.set(ym, { amount: tx.amount, day: d.getDate(), dateMs: d.getTime() });
    }
    if (d.getTime() > 0) {
      entry.displayMerchant = rawDesc;
      entry.category = tx.category;
      entry.accountId = tx.accountId;
    }
    groups.set(cleaned, entry);
  }

  const detected: DetectedSubscription[] = [];

  for (const [key, group] of groups.entries()) {
    const validMonths = Array.from(group.months.values()).filter(m => m.amount > 0);
    // Debe ser 1 cobro por mes en al menos 2 meses distintos (sin meses con múltiples compras)
    if (validMonths.length < 2 || validMonths.length !== group.months.size) continue;

    const amounts = validMonths.map(m => m.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    if (median <= 0) continue;

    const maxDeviation = Math.max(...amounts.map(a => Math.abs(a - median) / median));
    if (maxDeviation > 0.15) continue;

    const avgDay = Math.round(
      validMonths.reduce((sum, m) => sum + m.day, 0) / validMonths.length,
    );

    detected.push({
      key: normalizeMerchant(key),
      merchant: group.displayMerchant,
      category: group.category,
      estimatedAmount: Math.round(computeNormalizedEwma(validMonths.map(m => m.amount))),
      monthsDetected: validMonths.length,
      accountId: group.accountId,
      accountName: accountNameById.get(group.accountId),
      typicalDayOfMonth: Math.min(31, Math.max(1, avgDay)),
    });
  }

  return detected.sort((a, b) => b.estimatedAmount - a.estimatedAmount).slice(0, 4);
}

/**
 * Calcula tendencias y gasto ponderado (EWMA) por categoría a través de los meses
 * analizados.
 */
export function buildCategoryTrendInsights(input: {
  monthKeys: readonly string[];
  transactions: readonly Transaction[];
}): Map<string, CategoryTrendInsight> {
  const { monthKeys, transactions } = input;
  const monthKeySet = new Set(monthKeys);
  const byCategoryMonth = new Map<string, Map<string, number>>();

  for (const tx of transactions) {
    if (!isRealBudgetTransaction(tx) || tx.type !== 'expense') continue;
    const d = new Date(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthKeySet.has(key)) continue;

    const monthMap = byCategoryMonth.get(tx.category) ?? new Map<string, number>();
    monthMap.set(key, (monthMap.get(key) ?? 0) + tx.amount);
    byCategoryMonth.set(tx.category, monthMap);
  }

  const result = new Map<string, CategoryTrendInsight>();
  const monthsCount = Math.max(1, monthKeys.length);

  for (const [category, monthMap] of byCategoryMonth.entries()) {
    const series = monthKeys.map(k => monthMap.get(k) ?? 0);
    const total = series.reduce((s, v) => s + v, 0);
    const simpleAvgSpent = total / monthsCount;
    const dampened = dampenOutliers(series);
    const ewmaSpent = computeNormalizedEwma(dampened);

    let trend: CategoryTrendInsight['trend'] = 'stable';
    let trendSlopePct = 0;
    if (series.length >= 2) {
      const last = series[series.length - 1];
      const prev = series[series.length - 2];
      const baseline = prev > 0 ? prev : simpleAvgSpent;
      if (baseline > 0) {
        trendSlopePct = Math.round(((last - prev) / baseline) * 100);
        if (trendSlopePct >= 15) trend = 'rising';
        else if (trendSlopePct <= -15) trend = 'falling';
      }
    }

    result.set(category, {
      category,
      group: classifyBudgetCategory(category),
      ewmaSpent,
      simpleAvgSpent,
      trend,
      trendSlopePct,
      isFixed: isFixedBudgetCategory(category),
    });
  }

  return result;
}
