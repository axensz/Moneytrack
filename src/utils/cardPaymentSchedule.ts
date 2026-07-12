/**
 * Constructor PURO del calendario de pagos de tarjetas (extractos).
 * Proyecta cuotas mes a mes desde el historial COMPLETO de transacciones.
 */
import type { Transaction, Account, RecurringPayment } from '../types/finance';
import { cycleIndexOf, getCycleByIndex, type CreditCycle } from './creditCycles';
import { roundMoney } from './formatters';
import { ensureDate } from './dateUtils';
import { getAccountReferenceIds } from './accountTransactions';
import { getYearlyAnchorMonth } from './recurringDates';
import { SPECIAL_CATEGORIES, APP_CONFIG } from '../config/constants';

export interface InstallmentItem {
  description: string;
  cuota: number;   // número de cuota (1-based)
  total: number;   // total de cuotas
  amount: number;  // monto de esta cuota
}

/** Cargos de una tarjeta que caen en el ciclo `index` (cuotas + contado). */
export function cardStatementForCycle(
  cutoffDay: number,
  index: number,
  charges: Transaction[],
  now: Date,
): { total: number; items: InstallmentItem[] } {
  const items: InstallmentItem[] = [];
  let total = 0;
  for (const tx of charges) {
    const first = cycleIndexOf(cutoffDay, ensureDate(tx.date), now);
    const n = tx.installments && tx.installments > 1 ? tx.installments : 1;
    const k = index - first; // offset 0-based de la cuota
    if (k < 0 || k >= n) continue;
    let amount = tx.amount;
    if (n > 1) {
      const regularInstallment = roundMoney(tx.monthlyInstallmentAmount ?? tx.amount / n);
      const contractualTotal = roundMoney(tx.amount + Math.max(0, tx.totalInterestAmount ?? 0));
      // La última cuota absorbe el residuo de centavos para que la suma sea
      // exactamente igual a principal + interés, no n * cuota redondeada.
      amount = k === n - 1
        ? roundMoney(contractualTotal - regularInstallment * (n - 1))
        : regularInstallment;
    }
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

export type CycleStatus = 'paid' | 'partial' | 'pending' | 'projected';

/**
 * Pagos a la tarjeta dentro de la ventana de pago del ciclo `index`:
 * (cierre del ciclo, cierre del ciclo siguiente].
 *
 * // ponytail: heurística — los pagos no se etiquetan a un ciclo concreto; un
 * // pago podría cubrir parte de otro. Suficiente para visualización.
 * // Upgrade path: etiquetar pagos a su ciclo (como recurringCycle) si se necesita exactitud.
 */
export function paidForCycle(
  cutoffDay: number,
  paymentDay: number,
  index: number,
  payments: Transaction[],
  now: Date,
): number {
  const cyc = getCycleByIndex(cutoffDay, paymentDay, index, now);
  const next = getCycleByIndex(cutoffDay, paymentDay, index + 1, now);
  let sum = 0;
  for (const p of payments) {
    if (!p.paid) continue;
    const d = ensureDate(p.date);
    if (d > cyc.cycleEnd && d <= next.cycleEnd) sum += p.amount;
  }
  return roundMoney(sum);
}

/** Clasifica el estado de pago de un ciclo: projected (futuro) / paid / partial / pending. */
export function cycleStatus(index: number, total: number, paid: number): CycleStatus {
  if (index > 0) return 'projected';
  if (paid >= total - 0.01) return 'paid';
  if (paid <= 0.01) return 'pending';
  return 'partial';
}

export interface RecurringItem { name: string; amount: number; }

export interface CardMonthPayment {
  cardId: string;
  cardName: string;
  statementTotal: number;   // total facturado del ciclo
  paidAmount: number;       // pagado en la ventana de pago
  remaining: number;        // saldo pendiente = statementTotal - paidAmount (clamp >= 0)
  status: CycleStatus;
  installmentItems: InstallmentItem[];
  recurringItems: RecurringItem[];
  cycleStart: Date;
  cycleEnd: Date;
  paymentDueDate: Date;
  /** Solo en el ciclo actual (index 0): total facturado del ciclo en curso. */
  projectedTotal?: number;
  /** Solo en el ciclo actual: deuda total proyectada = Σ statementTotal de ciclos
   *  index >= 0 (actual + futuros). Se contrasta con el usedCredit real de la tarjeta
   *  para resaltar las compras "sin registrar". */
  totalProjectedDebt?: number;
  isActiveCycle?: boolean;
}

export interface MonthGroup {
  monthKey: string;   // 'YYYY-MM' de la fecha de pago
  label: string;      // 'julio de 2026'
  total: number;      // total facturado del mes (Σ statementTotal)
  remaining: number;  // saldo pendiente del mes (Σ remaining) — "lo que debes"
  isCurrent: boolean;
  isFuture: boolean;
  hasActiveCycle: boolean;
  cards: CardMonthPayment[];
}

const PAST_MONTHS = 6;            // ponytail: tope de histórico; configurable si se pide
const MAX_FUTURE = 12;            // ponytail: tope duro de proyección
const MIN_FUTURE_RECURRING = 3;   // si solo hay periódicos (sin cuotas), proyecta 3 meses

// Cargos: excluir categorías de ajuste/préstamo (no son compras reales).
const CHARGE_EXCLUDED = new Set<string>(SPECIAL_CATEGORIES.adjustmentCategories);
// Pagos: excluir solo ajustes de saldo; 'Pago Crédito'/'Pago TC' SÍ son pagos.
const PAYMENT_EXCLUDED = new Set<string>(SPECIAL_CATEGORIES.groupedAdjustmentCategories);

const monthKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const labelOf = (d: Date): string =>
  d.toLocaleDateString(APP_CONFIG.locale, { month: 'long', year: 'numeric' });

function isCardCharge(tx: Transaction, refIds: Set<string>): boolean {
  // Los pagos de TC (categoría 'Pago Crédito'/'Pago TC') quedan fuera vía CHARGE_EXCLUDED.
  return tx.type === 'expense' && refIds.has(tx.accountId) && !CHARGE_EXCLUDED.has(tx.category);
}
function isCardPayment(tx: Transaction, refIds: Set<string>): boolean {
  if (PAYMENT_EXCLUDED.has(tx.category)) return false;
  return (tx.type === 'income' && refIds.has(tx.accountId)) ||
    (tx.type === 'transfer' && !!tx.toAccountId && refIds.has(tx.toAccountId));
}

function recurringForCycle(
  refIds: Set<string>,
  cycle: CreditCycle,
  recurringPayments: RecurringPayment[],
): { total: number; items: RecurringItem[] } {
  if (cycle.index <= 0) return { total: 0, items: [] }; // pasado/actual ya está en txs reales
  const items: RecurringItem[] = [];
  let total = 0;
  for (const r of recurringPayments) {
    if (!r.isActive || !r.accountId || !refIds.has(r.accountId)) continue;
    if (r.frequency === 'yearly') {
      const anchor = getYearlyAnchorMonth(r, cycle.cycleEnd.getMonth());
      if (cycle.cycleEnd.getMonth() !== anchor) continue; // anual: solo su mes
    }
    total += r.amount;
    items.push({ name: r.name, amount: r.amount });
  }
  return { total: roundMoney(total), items };
}

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
    const last = cycleIndexOf(cutoffDay, ensureDate(tx.date), now) + n - 1;
    if (last > maxIdx) maxIdx = last;
  }
  // Si no hay cuotas futuras pero hay periódicos activos, proyecta al menos MIN_FUTURE_RECURRING.
  if (maxIdx === 0) {
    const hasRecurring = recurringPayments.some(r => r.isActive && r.accountId && refIds.has(r.accountId));
    if (hasRecurring) maxIdx = MIN_FUTURE_RECURRING;
  }
  return Math.min(maxIdx, MAX_FUTURE);
}

function addCardMonthToGroup(
  groups: Map<string, MonthGroup>,
  cycleEnd: Date,
  currentKey: string,
  cardMonth: CardMonthPayment,
): void {
  const key = monthKeyOf(cycleEnd);
  const group = groups.get(key) ?? {
    monthKey: key,
    label: labelOf(cycleEnd),
    total: 0,
    remaining: 0,
    isCurrent: key === currentKey,
    isFuture: key > currentKey,
    hasActiveCycle: false,
    cards: [],
  };
  group.hasActiveCycle = group.hasActiveCycle || !!cardMonth.isActiveCycle;
  group.total = roundMoney(group.total + cardMonth.statementTotal);
  group.remaining = roundMoney(group.remaining + cardMonth.remaining);
  group.cards.push(cardMonth);
  groups.set(key, group);
}

interface CycleDraft {
  index: number;
  cycle: CreditCycle;
  statementTotal: number;
  installmentItems: InstallmentItem[];
  recurringItems: RecurringItem[];
}

function allocatePaymentsToCycles(cycles: CycleDraft[], payments: Transaction[]): Map<number, number> {
  const paidByIndex = new Map<number, number>();
  const payableCycles = cycles
    .filter(cycle => cycle.index <= 0 && cycle.statementTotal > 0)
    .sort((a, b) => a.cycle.cycleEnd.getTime() - b.cycle.cycleEnd.getTime());
  const paidPayments = payments
    .filter(payment => payment.paid)
    .sort((a, b) => ensureDate(a.date).getTime() - ensureDate(b.date).getTime());

  for (const payment of paidPayments) {
    const paidAt = ensureDate(payment.date);
    let amountLeft = payment.amount;
    for (const cycle of payableCycles) {
      if (amountLeft <= 0.01) break;
      if (paidAt <= cycle.cycle.cycleEnd) continue;

      const alreadyPaid = paidByIndex.get(cycle.index) ?? 0;
      const remaining = roundMoney(cycle.statementTotal - alreadyPaid);
      if (remaining <= 0.01) continue;

      const applied = Math.min(amountLeft, remaining);
      paidByIndex.set(cycle.index, roundMoney(alreadyPaid + applied));
      amountLeft = roundMoney(amountLeft - applied);
    }
  }

  return paidByIndex;
}

export function buildCardPaymentSchedule(
  accounts: Account[],
  transactions: Transaction[],
  recurringPayments: RecurringPayment[],
  now: Date = new Date(),
): MonthGroup[] {
  const cards = accounts.filter(a => a.type === 'credit' && a.cutoffDay && a.paymentDay && a.id);
  const groups = new Map<string, MonthGroup>();
  const currentKey = monthKeyOf(now);

  for (const card of cards) {
    const refIds = new Set(getAccountReferenceIds(card));
    const charges = transactions.filter(t => isCardCharge(t, refIds));
    const payments = transactions.filter(t => isCardPayment(t, refIds));
    const horizon = computeFutureHorizon(card.cutoffDay!, charges, refIds, recurringPayments, now);
    // Comparación de saldos: deuda total proyectada (Σ statementTotal de ciclos index >= 0)
    // y referencia al ciclo actual, para contrastar contra el usedCredit real de la tarjeta.
    let totalProjectedDebt = 0;
    let currentCycleEntry: CardMonthPayment | null = null;

    const cycles: CycleDraft[] = [];

    for (let index = -PAST_MONTHS; index <= horizon; index++) {
      const cycle = getCycleByIndex(card.cutoffDay!, card.paymentDay!, index, now);
      const stmt = cardStatementForCycle(card.cutoffDay!, index, charges, now);
      const rec = recurringForCycle(refIds, cycle, recurringPayments);
      const statementTotal = roundMoney(stmt.total + rec.total);
      cycles.push({
        index,
        cycle,
        statementTotal,
        installmentItems: stmt.items,
        recurringItems: rec.items,
      });
    }

    const paidByIndex = allocatePaymentsToCycles(cycles, payments);

    for (const draft of cycles) {
      const { index, cycle, statementTotal } = draft;
      // Acumular ANTES del descarte: la deuda proyectada cuenta actual + futuros aunque
      // un ciclo intermedio quede en 0.
      if (index >= 0) totalProjectedDebt += statementTotal;
      // ponytail: si el ciclo actual queda en 0 (sin cargos este mes) la tarjeta no aparece
      // y no se muestra la comparación de saldos; cubre el caso común. Upgrade path: diferir
      // e insertar el ciclo-0 vacío cuando la tarjeta tiene deuda (Req 3.3 del spec original).
      if (index === 0 && statementTotal <= 0 && (card.usedCredit ?? 0) > 0) {
        const realDebt = roundMoney(card.usedCredit ?? 0);
        const cardMonth: CardMonthPayment = {
          cardId: card.id!,
          cardName: card.name,
          statementTotal: 0,
          paidAmount: 0,
          remaining: realDebt,
          status: 'pending',
          installmentItems: [],
          recurringItems: [],
          cycleStart: cycle.cycleStart,
          cycleEnd: cycle.cycleEnd,
          paymentDueDate: cycle.paymentDueDate,
          projectedTotal: 0,
          totalProjectedDebt: roundMoney(totalProjectedDebt),
          isActiveCycle: true,
        };
        currentCycleEntry = cardMonth;
        addCardMonthToGroup(groups, cycle.cycleEnd, currentKey, cardMonth);
        continue;
      }
      if (statementTotal <= 0) continue;

      const paid = index <= 0 ? (paidByIndex.get(index) ?? 0) : 0;
      const remaining = roundMoney(Math.max(0, statementTotal - paid));

      const cardMonth: CardMonthPayment = {
        cardId: card.id!,
        cardName: card.name,
        statementTotal,
        paidAmount: paid,
        remaining,
        status: cycleStatus(index, statementTotal, paid),
        installmentItems: draft.installmentItems,
        recurringItems: draft.recurringItems,
        cycleStart: cycle.cycleStart,
        cycleEnd: cycle.cycleEnd,
        paymentDueDate: cycle.paymentDueDate,
        ...(index === 0 && { projectedTotal: statementTotal }),
        ...(index === 0 && { isActiveCycle: true }),
      };
      if (index === 0) currentCycleEntry = cardMonth;

      // Agrupar por el mes del CORTE (cycleEnd) = el extracto al que pertenece el
      // cargo, no por la fecha de pago. Agrupar por pago corría las compras un mes
      // hacia adelante (una compra de junio aparecía en julio/agosto).
      addCardMonthToGroup(groups, cycle.cycleEnd, currentKey, cardMonth);
    }

    // Colgar la deuda total proyectada en la entrada del ciclo actual (si existe).
    if (currentCycleEntry) currentCycleEntry.totalProjectedDebt = roundMoney(totalProjectedDebt);
  }

  return Array.from(groups.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}
