/**
 * Constructor PURO del calendario de pagos de tarjetas (extractos).
 * Proyecta cuotas mes a mes desde el historial COMPLETO de transacciones.
 */
import type { Transaction } from '../types/finance';
import { cycleIndexOf } from './creditCycles';
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
    total += amount;
    items.push({
      description: tx.description || 'Compra',
      cuota: k + 1,
      total: n,
      amount: roundMoney(amount),
    });
  }
  return { total: roundMoney(total), items };
}
