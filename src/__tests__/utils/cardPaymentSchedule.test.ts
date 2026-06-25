import { describe, it, expect } from 'vitest';
import type { Transaction } from '../../types/finance';
import { cardStatementForCycle, paidForCycle, cycleStatus } from '../../utils/cardPaymentSchedule';

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

  it('total === suma de items.amount con división no exacta (dos cargos mismo ciclo)', () => {
    // 100.000 / 3 = 33.333,33… → dos cargos en el mismo ciclo (-1) no deben descuadrar.
    const charges = [
      tx({ id: 'a', amount: 100_000, installments: 3 }),
      tx({ id: 'b', amount: 100_000, installments: 3 }),
    ];
    const r = cardStatementForCycle(CUTOFF, -1, charges, NOW);
    const sumItems = r.items.reduce((s, it) => s + it.amount, 0);
    expect(r.total).toBe(sumItems);
  });
});

describe('paidForCycle + cycleStatus', () => {
  const NOW2 = new Date(2026, 5, 20);
  const CUT = 15, PAY = 5;
  const pay = (date: Date, amount: number): Transaction => ({
    id: 'p', type: 'transfer', amount, category: 'Pago Crédito', description: '',
    date, paid: true, accountId: 'banco', toAccountId: 'tc',
  } as Transaction);

  it('cuenta pagos en la ventana (cierre, próximo cierre]', () => {
    // ciclo -1 cierra 15 jun; ventana de pago = (15 jun, 15 jul]. Un pago el 5 jul cuenta.
    const sum = paidForCycle(CUT, PAY, -1, [pay(new Date(2026, 6, 5), 100_000)], NOW2);
    expect(sum).toBe(100_000);
    // un pago el 10 jun (antes del corte del 15) cae en la ventana del ciclo -2, NO del -1.
    const none = paidForCycle(CUT, PAY, -1, [pay(new Date(2026, 5, 10), 100_000)], NOW2);
    expect(none).toBe(0);
  });

  it('paidForCycle ignora pagos no pagados (paid:false)', () => {
    const unpaid = { ...pay(new Date(2026, 6, 5), 100_000), paid: false };
    expect(paidForCycle(CUT, PAY, -1, [unpaid], NOW2)).toBe(0);
  });

  it('estado: futuro=projected, total pagado=paid, parcial=partial, cero=pending', () => {
    expect(cycleStatus(1, 100_000, 0)).toBe('projected');
    expect(cycleStatus(-1, 100_000, 100_000)).toBe('paid');
    expect(cycleStatus(-1, 100_000, 40_000)).toBe('partial');
    expect(cycleStatus(-1, 100_000, 0)).toBe('pending');
  });
});
