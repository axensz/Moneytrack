/**
 * Hook puro de cálculo del calendario de pagos de tarjetas de crédito.
 * Proyecta cuotas mes a mes desde el historial COMPLETO de transacciones.
 *
 * Entrada: cuentas, transacciones (balanceTransactions — historial completo),
 * pagos periódicos, y un `now` inyectable para tests deterministas.
 *
 * Salida: MonthGroup[] ordenados ascendente por monthKey (YYYY-MM).
 */
import { useMemo } from 'react';
import type { Account, Transaction, RecurringPayment } from '../types/finance';
import { cycleIndexOf, getCycleByIndex, type CreditCycle } from '../utils/creditCycles';
import { roundMoney } from '../utils/formatters';
import { getAccountReferenceIds } from '../utils/accountTransactions';
import { getYearlyAnchorMonth } from '../utils/recurringDates';
import { SPECIAL_CATEGORIES, APP_CONFIG } from '../config/constants';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface InstallmentItem {
  description: string;
  cuota: number;      // current installment number (1-based)
  total: number;      // total installments
  amount: number;     // monthly installment amount (COP)
}

export interface RecurringItem {
  name: string;
  amount: number;     // monthly amount (COP)
}

export interface CardMonthPayment {
  cardId: string;
  cardName: string;
  statementTotal: number;          // total owed for this card this month (COP)
  paidAmount: number;              // payments applied (for "partial")
  status: 'paid' | 'partial' | 'pending' | 'projected';
  installmentItems: InstallmentItem[];
  recurringItems: RecurringItem[];
  cycleStart: Date;
  cycleEnd: Date;
  paymentDueDate: Date;
  projectedTotal?: number;         // only present in current cycle (index === 0)
  totalProjectedDebt?: number;     // sum of statementTotal for all cycles index >= 0 (current + future)
}

export interface MonthGroup {
  monthKey: string;                // 'YYYY-MM' of paymentDueDate
  label: string;                   // 'julio 2026' (es-CO formatted)
  total: number;                   // Σ statementTotal across cards (COP)
  isCurrent: boolean;              // bucket containing current month's payment
  isFuture: boolean;
  cards: CardMonthPayment[];
}

export interface CardPaymentScheduleResult {
  months: MonthGroup[];
  consolidatedProjectedTotal: number;       // Sum of projectedTotal across all cards
  consolidatedTotalProjectedDebt: number;   // Sum of totalProjectedDebt across all cards in current month
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const PAST_MONTHS = 6;
const MAX_FUTURE = 12;
const MIN_FUTURE_RECURRING = 3;

/** Categorías que NO son cargos reales de la tarjeta (ajustes, pagos de TC, etc.) */
const CHARGE_EXCLUDED = new Set<string>(SPECIAL_CATEGORIES.adjustmentCategories);
/** Categorías que NO cuentan como pagos (ajustes de saldo solamente) */
const PAYMENT_EXCLUDED = new Set<string>(SPECIAL_CATEGORIES.groupedAdjustmentCategories);

// ─── Helpers internos ──────────────────────────────────────────────────────────

const monthKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const labelOf = (d: Date): string =>
  d.toLocaleDateString(APP_CONFIG.locale, { month: 'long', year: 'numeric' });

/** Es un cargo a la tarjeta (compra/gasto, NO pago de TC ni ajuste). */
function isCardCharge(tx: Transaction, refIds: Set<string>): boolean {
  return tx.type === 'expense' && refIds.has(tx.accountId) && !CHARGE_EXCLUDED.has(tx.category);
}

/** Es un pago hacia la tarjeta (income directo o transfer a la tarjeta). */
function isCardPayment(tx: Transaction, refIds: Set<string>): boolean {
  if (PAYMENT_EXCLUDED.has(tx.category)) return false;
  return (tx.type === 'income' && refIds.has(tx.accountId)) ||
    (tx.type === 'transfer' && !!tx.toAccountId && refIds.has(tx.toAccountId));
}

/**
 * Computa cargos del statement (cuotas + contado) para un ciclo dado.
 * Distribuye installments: monthlyInstallmentAmount ?? amount en N ciclos consecutivos.
 */
function cardStatementForCycle(
  cutoffDay: number,
  index: number,
  charges: Transaction[],
  now: Date,
): { total: number; items: InstallmentItem[] } {
  const items: InstallmentItem[] = [];
  let total = 0;

  for (const tx of charges) {
    const firstIndex = cycleIndexOf(cutoffDay, new Date(tx.date), now);
    const n = tx.installments && tx.installments > 1 ? tx.installments : 1;
    const k = index - firstIndex; // offset 0-based de la cuota en este ciclo

    if (k < 0 || k >= n) continue;

    const amount = n > 1
      ? (tx.monthlyInstallmentAmount ?? roundMoney(tx.amount / n))
      : tx.amount;
    const rounded = roundMoney(amount);
    total += rounded;

    items.push({
      description: tx.description || 'Compra',
      cuota: k + 1,
      total: n,
      amount: rounded,
    });
  }

  return { total: roundMoney(total), items };
}

/**
 * Suma de pagos a la tarjeta dentro de la ventana de pago del ciclo.
 * Ventana: (prev.paymentDueDate, next.cycleEnd]
 * - Límite inferior (exclusivo): paymentDueDate del ciclo anterior (index - 1)
 * - Límite superior (inclusivo): cycleEnd del ciclo siguiente (index + 1)
 * - Caso borde: si no hay ciclo anterior (index <= -PAST_MONTHS), usa cycleStart del ciclo evaluado
 */
function paidForCycle(
  cutoffDay: number,
  paymentDay: number,
  index: number,
  payments: Transaction[],
  now: Date,
): number {
  const cyc = getCycleByIndex(cutoffDay, paymentDay, index, now);
  const next = getCycleByIndex(cutoffDay, paymentDay, index + 1, now);

  // Determine exclusive lower bound
  let lowerBound: Date;
  if (index <= -PAST_MONTHS) {
    // First cycle in history — use cycleStart as exclusive lower bound
    lowerBound = cyc.cycleStart;
  } else {
    const prev = getCycleByIndex(cutoffDay, paymentDay, index - 1, now);
    lowerBound = prev.paymentDueDate;
  }

  let sum = 0;
  for (const p of payments) {
    if (!p.paid) continue;
    const d = new Date(p.date);
    // Window: (lowerBound, next.cycleEnd]
    if (d > lowerBound && d <= next.cycleEnd) sum += p.amount;
  }

  return roundMoney(sum);
}

/** Clasifica el estado de pago: projected (futuro) / paid / partial / pending. */
function cycleStatus(index: number, total: number, paid: number): 'paid' | 'partial' | 'pending' | 'projected' {
  if (index > 0) return 'projected';
  if (paid >= total - 0.01) return 'paid';
  if (paid <= 0.01) return 'pending';
  return 'partial';
}

/**
 * Recurring payments para un ciclo futuro (index > 0).
 * monthly → todos los ciclos futuros.
 * yearly → solo si el mes del cycleEnd coincide con el anchor month.
 */
function recurringForCycle(
  refIds: Set<string>,
  cycle: CreditCycle,
  recurringPayments: RecurringPayment[],
): { total: number; items: RecurringItem[] } {
  if (cycle.index <= 0) return { total: 0, items: [] };

  const items: RecurringItem[] = [];
  let total = 0;

  for (const r of recurringPayments) {
    if (!r.isActive || !r.accountId || !refIds.has(r.accountId)) continue;

    if (r.frequency === 'yearly') {
      const anchor = getYearlyAnchorMonth(r, cycle.cycleEnd.getMonth());
      if (cycle.cycleEnd.getMonth() !== anchor) continue;
    }

    total += r.amount;
    items.push({ name: r.name, amount: r.amount });
  }

  return { total: roundMoney(total), items };
}

/**
 * Determina el horizonte futuro para una tarjeta:
 * - max cycle index de cualquier installment activo
 * - o +3 si solo hay recurring
 * - hard cap +12
 */
function computeFutureHorizon(
  cutoffDay: number,
  charges: Transaction[],
  refIds: Set<string>,
  recurringPayments: RecurringPayment[],
  now: Date,
): number {
  let maxIdx = 0;

  for (const tx of charges) {
    const n = tx.installments && tx.installments > 1 ? tx.installments : 1;
    const lastCycle = cycleIndexOf(cutoffDay, new Date(tx.date), now) + n - 1;
    if (lastCycle > maxIdx) maxIdx = lastCycle;
  }

  // Si no hay cuotas futuras pero hay periódicos activos, proyecta al menos MIN_FUTURE_RECURRING
  if (maxIdx === 0) {
    const hasRecurring = recurringPayments.some(
      r => r.isActive && r.accountId && refIds.has(r.accountId)
    );
    if (hasRecurring) maxIdx = MIN_FUTURE_RECURRING;
  }

  return Math.min(maxIdx, MAX_FUTURE);
}

// ─── Función principal de cálculo ──────────────────────────────────────────────

/**
 * Construye el calendario de pagos de tarjetas (MonthGroup[]).
 * Función pura, exportada para facilitar testing sin React.
 */
export function buildCardPaymentSchedule(
  accounts: Account[],
  transactions: Transaction[],
  recurringPayments: RecurringPayment[],
  now: Date = new Date(),
): CardPaymentScheduleResult {
  const cards = accounts.filter(
    a => a.type === 'credit' && a.cutoffDay && a.paymentDay && a.id
  );

  const groups = new Map<string, MonthGroup>();
  const currentKey = monthKeyOf(now);

  // Deferred current-cycle entries for cards that have statementTotal === 0 at index 0.
  // These are only included if the card has at least one past/current entry (Req 3.3).
  const deferredCurrentCycle: { card: Account; cardMonth: CardMonthPayment; key: string }[] = [];

  for (const card of cards) {
    const refIds = new Set(getAccountReferenceIds(card));
    const charges = transactions.filter(t => isCardCharge(t, refIds));
    const payments = transactions.filter(t => isCardPayment(t, refIds));
    const horizon = computeFutureHorizon(card.cutoffDay!, charges, refIds, recurringPayments, now);
    let cardHasPastOrCurrentEntries = false;
    let totalDebt = 0;                    // sum of statementTotal for index >= 0
    let currentCycleEntry: CardMonthPayment | null = null;  // reference to index===0 entry

    for (let index = -PAST_MONTHS; index <= horizon; index++) {
      const cycle = getCycleByIndex(card.cutoffDay!, card.paymentDay!, index, now);
      const stmt = cardStatementForCycle(card.cutoffDay!, index, charges, now);
      const rec = recurringForCycle(refIds, cycle, recurringPayments);
      const statementTotal = roundMoney(stmt.total + rec.total);

      // Accumulate total projected debt for current + future cycles
      if (index >= 0) totalDebt += statementTotal;

      // Omitir meses con total === 0 (except current cycle handled below)
      if (statementTotal <= 0 && index !== 0) continue;

      const paid = index <= 0
        ? paidForCycle(card.cutoffDay!, card.paymentDay!, index, payments, now)
        : 0;

      const cardMonth: CardMonthPayment = {
        cardId: card.id!,
        cardName: card.name,
        statementTotal,
        paidAmount: paid,
        status: cycleStatus(index, statementTotal, paid),
        installmentItems: stmt.items,
        recurringItems: rec.items,
        cycleStart: cycle.cycleStart,
        cycleEnd: cycle.cycleEnd,
        paymentDueDate: cycle.paymentDueDate,
        ...(index === 0 && { projectedTotal: statementTotal }),
      };

      // Track reference to current cycle entry for totalProjectedDebt assignment
      if (index === 0) currentCycleEntry = cardMonth;

      // If current cycle has zero total, defer insertion until we know card has other past/current entries
      if (index === 0 && statementTotal <= 0) {
        const key = monthKeyOf(cycle.paymentDueDate);
        deferredCurrentCycle.push({ card, cardMonth, key });
        continue;
      }

      if (index <= 0 && statementTotal > 0) {
        cardHasPastOrCurrentEntries = true;
      }

      const key = monthKeyOf(cycle.paymentDueDate);
      const group = groups.get(key) ?? {
        monthKey: key,
        label: labelOf(cycle.paymentDueDate),
        total: 0,
        isCurrent: key === currentKey,
        isFuture: key > currentKey,
        cards: [],
      };

      group.total = roundMoney(group.total + statementTotal);
      group.cards.push(cardMonth);
      groups.set(key, group);
    }

    // If the card had past/current entries, include deferred zero-total current-cycle entry (Req 3.3)
    if (cardHasPastOrCurrentEntries) {
      const deferred = deferredCurrentCycle.filter(d => d.card === card);
      for (const { cardMonth, key } of deferred) {
        const group = groups.get(key) ?? {
          monthKey: key,
          label: labelOf(cardMonth.paymentDueDate),
          total: 0,
          isCurrent: key === currentKey,
          isFuture: key > currentKey,
          cards: [],
        };

        group.total = roundMoney(group.total + cardMonth.statementTotal);
        group.cards.push(cardMonth);
        groups.set(key, group);
      }
    }

    // Attach totalProjectedDebt to current cycle entry
    if (currentCycleEntry) {
      currentCycleEntry.totalProjectedDebt = roundMoney(totalDebt);
    }
  }

  const months = Array.from(groups.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  // Compute consolidatedProjectedTotal and consolidatedTotalProjectedDebt:
  // sum of projectedTotal / totalProjectedDebt across all cards in current cycle
  let consolidatedProjectedTotal = 0;
  let consolidatedTotalProjectedDebt = 0;
  for (const month of months) {
    if (month.isCurrent) {
      for (const card of month.cards) {
        if (card.projectedTotal !== undefined) {
          consolidatedProjectedTotal += card.projectedTotal;
        }
        if (card.totalProjectedDebt !== undefined) {
          consolidatedTotalProjectedDebt += card.totalProjectedDebt;
        }
      }
    }
  }

  return {
    months,
    consolidatedProjectedTotal: roundMoney(consolidatedProjectedTotal),
    consolidatedTotalProjectedDebt: roundMoney(consolidatedTotalProjectedDebt),
  };
}

// ─── Hook de React ─────────────────────────────────────────────────────────────

/**
 * Calendario de pagos de tarjetas (extractos), memoizado.
 * @param accounts - Todas las cuentas (filtra internamente las credit con cutoffDay/paymentDay)
 * @param transactions - balanceTransactions: historial COMPLETO, NO paginado
 * @param recurringPayments - Pagos periódicos activos
 * @param now - Fecha de referencia (inyectable para tests deterministas)
 */
export function useCardPaymentSchedule(
  accounts: Account[],
  transactions: Transaction[],
  recurringPayments: RecurringPayment[],
  now?: Date,
): CardPaymentScheduleResult {
  return useMemo(
    () => buildCardPaymentSchedule(accounts, transactions, recurringPayments, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, transactions, recurringPayments, now],
  );
}
