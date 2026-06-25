import { describe, it, expect } from 'vitest';
import type { Account, Transaction, RecurringPayment } from '../../types/finance';
import { buildCardPaymentSchedule } from '../../utils/cardPaymentSchedule';

const NOW = new Date(2026, 5, 20); // 20 jun 2026
const card: Account = {
  id: 'tc', name: 'Visa', type: 'credit', isDefault: false,
  initialBalance: 0, creditLimit: 5_000_000, cutoffDay: 15, paymentDay: 5,
};

const charge = (o: Partial<Transaction>): Transaction => ({
  id: 'c', type: 'expense', amount: 0, category: 'Compras', description: 'Compra',
  date: new Date(2026, 4, 16), paid: false, accountId: 'tc', ...o, // 16 may → first=-1
} as Transaction);

describe('buildCardPaymentSchedule', () => {
  it('proyecta cuotas a varios meses y omite meses sin deuda', () => {
    // Compra de mayo a 3 cuotas de 100k → cuotas en index -1, 0, 1.
    const groups = buildCardPaymentSchedule(
      [card],
      [charge({ amount: 300_000, installments: 3, monthlyInstallmentAmount: 100_000 })],
      [], NOW,
    );
    // 3 meses con deuda, todos con total 100k.
    expect(groups.length).toBe(3);
    expect(groups.every(g => g.total === 100_000)).toBe(true);
    // Ordenados ascendente por monthKey.
    const keys = groups.map(g => g.monthKey);
    expect([...keys].sort()).toEqual(keys);
  });

  it('estado: cuota pasada pagada=paid, futura=projected', () => {
    const payment: Transaction = {
      id: 'p', type: 'transfer', amount: 100_000, category: 'Pago Crédito', description: '',
      date: new Date(2026, 6, 5), paid: true, accountId: 'banco', toAccountId: 'tc',
    } as Transaction;
    const groups = buildCardPaymentSchedule(
      [card],
      [charge({ amount: 300_000, installments: 3, monthlyInstallmentAmount: 100_000 }), payment],
      [], NOW,
    );
    const past = groups.find(g => g.cards[0].cycleEnd.getMonth() === 5); // ciclo -1 (cierra jun)
    expect(past?.cards[0].status).toBe('paid');
    const future = groups[groups.length - 1];
    expect(future.cards[0].status).toBe('projected');
  });

  it('remaining = statementTotal - pagado (saldo pendiente en pago parcial)', () => {
    const payment: Transaction = {
      id: 'pp', type: 'transfer', amount: 100_000, category: 'Pago Crédito', description: '',
      date: new Date(2026, 6, 5), paid: true, accountId: 'banco', toAccountId: 'tc',
    } as Transaction;
    const groups = buildCardPaymentSchedule(
      [card],
      [charge({ amount: 300_000, installments: 1 }), payment], // contado may → index -1, paga jul 5
      [], NOW,
    );
    const g = groups.find(x => x.cards[0].status === 'partial')!;
    expect(g.cards[0].statementTotal).toBe(300_000);
    expect(g.cards[0].paidAmount).toBe(100_000);
    expect(g.cards[0].remaining).toBe(200_000);
    expect(g.remaining).toBe(200_000);
  });

  it('periódico de la tarjeta se suma SOLO a meses futuros (no duplica el pasado)', () => {
    const rec: RecurringPayment = {
      id: 'r', name: 'Netflix', amount: 40_000, category: 'Entretenimiento',
      accountId: 'tc', dueDay: 10, frequency: 'monthly', isActive: true,
    };
    // Compra a 3 cuotas (index -1,0,1) + periódico. Futuro (index 1) = 100k + 40k.
    const groups = buildCardPaymentSchedule(
      [card],
      [charge({ amount: 300_000, installments: 3, monthlyInstallmentAmount: 100_000 })],
      [rec], NOW,
    );
    const future = groups[groups.length - 1]; // index 1
    expect(future.cards[0].statementTotal).toBe(140_000);
    expect(future.cards[0].recurringItems[0].name).toBe('Netflix');
    const past = groups[0]; // index -1
    expect(past.cards[0].statementTotal).toBe(100_000); // sin periódico
  });

  it('excluye ajustes de saldo de los cargos', () => {
    const groups = buildCardPaymentSchedule(
      [card],
      [charge({ amount: 999_000, installments: 1, category: 'Ajuste de saldo' })],
      [], NOW,
    );
    expect(groups.length).toBe(0); // el ajuste no es un cargo real
  });

  it('consolida dos tarjetas que pagan el mismo mes', () => {
    const card2: Account = { ...card, id: 'tc2', name: 'Amex' };
    const groups = buildCardPaymentSchedule(
      [card, card2],
      [
        charge({ id: 'a', amount: 100_000, installments: 1 }),                 // tc, mayo → index -1
        charge({ id: 'b', accountId: 'tc2', amount: 70_000, installments: 1 }), // tc2, mayo → index -1
      ],
      [], NOW,
    );
    const g = groups[0];
    expect(g.total).toBe(170_000);
    expect(g.cards.length).toBe(2);
  });
});
