import { describe, it, expect } from 'vitest';
import type { Transaction } from '../../types/finance';
import { cardStatementForCycle } from '../../utils/cardPaymentSchedule';

const NOW = new Date(2026, 5, 20); // 20 jun 2026; corte 15 → ciclo actual cierra jul (index 0)
const CUTOFF = 15;

const tx = (o: Partial<Transaction>): Transaction => ({
  id: 'x', type: 'expense', amount: 0, category: 'Compras', description: 'Compra',
  date: new Date(2026, 4, 16), paid: false, accountId: 'tc', ...o, // 16 may → cycleIndexOf = -1
} as Transaction);

describe('cardStatementForCycle', () => {
  it('compra a 12 cuotas de mayo: cuota 1 en index -1, cuota 2 en index 0', () => {
    // mayo (16/05) cae en cycleIndexOf = -1 respecto a NOW.
    const charges = [tx({ amount: 1_200_000, installments: 12, monthlyInstallmentAmount: 100_000 })];
    expect(cardStatementForCycle(CUTOFF, -1, charges, NOW).total).toBe(100_000);
    const cur = cardStatementForCycle(CUTOFF, 0, charges, NOW);
    expect(cur.total).toBe(100_000);
    expect(cur.items[0].cuota).toBe(2);
    expect(cur.items[0].total).toBe(12);
  });

  it('compra a 12 cuotas (16 may, first=-1): cuota 12 en index 10, fuera de rango en 11', () => {
    const charges = [tx({ amount: 1_200_000, installments: 12, monthlyInstallmentAmount: 100_000 })];
    expect(cardStatementForCycle(CUTOFF, 10, charges, NOW).total).toBe(100_000); // cuota 12 (última)
    expect(cardStatementForCycle(CUTOFF, 11, charges, NOW).total).toBe(0);
  });

  it('compra de contado solo aparece en su propio ciclo', () => {
    const charges = [tx({ amount: 50_000, installments: 1 })]; // mayo → index -1
    expect(cardStatementForCycle(CUTOFF, -1, charges, NOW).total).toBe(50_000);
    expect(cardStatementForCycle(CUTOFF, 0, charges, NOW).total).toBe(0);
  });

  it('sin monthlyInstallmentAmount: divide el monto entre cuotas', () => {
    const charges = [tx({ amount: 300_000, installments: 3 })];
    expect(cardStatementForCycle(CUTOFF, -1, charges, NOW).total).toBe(100_000);
  });
});
