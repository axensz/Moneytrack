/**
 * Constructor PURO del calendario de pagos de tarjetas (extractos).
 * Proyecta cuotas mes a mes desde el historial COMPLETO de transacciones.
 */
import type { Transaction } from '../types/finance';
import { cycleIndexOf, getCycleByIndex } from './creditCycles';
import { roundMoney } from './formatters';

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
    const first = cycleIndexOf(cutoffDay, new Date(tx.date), now);
    const n = tx.installments && tx.installments > 1 ? tx.installments : 1;
    const k = index - first; // offset 0-based de la cuota
    if (k < 0 || k >= n) continue;
    const amount = n > 1 ? (tx.monthlyInstallmentAmount ?? tx.amount / n) : tx.amount;
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
    const d = new Date(p.date);
    if (d > cyc.cycleEnd && d <= next.cycleEnd) sum += p.amount;
  }
  return roundMoney(sum);
}

export function cycleStatus(index: number, total: number, paid: number): CycleStatus {
  if (index > 0) return 'projected';
  if (paid >= total - 0.01) return 'paid';
  if (paid <= 0.01) return 'pending';
  return 'partial';
}
