import { describe, expect, it } from 'vitest';
import { getDebtLinkCandidates } from '../../utils/debtPaymentLink';
import { LOAN_PAYMENT_CATEGORY } from '../../config/constants';
import type { Debt, Transaction } from '../../types/finance';

const lentDebt: Debt = {
  id: 'debt-1',
  personName: 'Juan',
  type: 'lent',
  originalAmount: 1000,
  remainingAmount: 1000,
  accountId: 'acc-1',
  isSettled: false,
};

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx-1',
  type: 'income',
  amount: 300,
  category: 'Otros',
  description: 'Movimiento',
  date: new Date('2026-08-01T12:00:00Z'),
  paid: true,
  accountId: 'acc-1',
  ...overrides,
});

describe('getDebtLinkCandidates', () => {
  it('devuelve solo movimientos pagados del type y la cuenta del préstamo (lent → income)', () => {
    const candidates = getDebtLinkCandidates([
      tx({ id: 'ok' }),
      tx({ id: 'no-pagado', paid: false }),
      tx({ id: 'otro-tipo', type: 'expense' }),
      tx({ id: 'otra-cuenta', accountId: 'acc-2' }),
    ], lentDebt);

    expect(candidates.map(c => c.id)).toEqual(['ok']);
  });

  it('para borrowed, el candidato correcto es un gasto', () => {
    const borrowed: Debt = { ...lentDebt, type: 'borrowed' };
    const candidates = getDebtLinkCandidates([
      tx({ id: 'ingreso', type: 'income' }),
      tx({ id: 'gasto', type: 'expense' }),
    ], borrowed);

    expect(candidates.map(c => c.id)).toEqual(['gasto']);
  });

  it('excluye los ya enlazados a deuda, a periódicos o a pagos vinculados', () => {
    const candidates = getDebtLinkCandidates([
      tx({ id: 'con-debt', debtId: 'debt-9', category: LOAN_PAYMENT_CATEGORY }),
      tx({ id: 'con-recurring', recurringPaymentId: 'rec-1' }),
      tx({ id: 'con-linked', linkedTransactionId: 'tx-99' }),
      tx({ id: 'libre' }),
    ], lentDebt);

    expect(candidates.map(c => c.id)).toEqual(['libre']);
  });

  it('excluye filas sin id y ordena por fecha descendente', () => {
    const candidates = getDebtLinkCandidates([
      tx({ id: undefined }),
      tx({ id: 'viejo', date: new Date('2026-01-01T00:00:00Z') }),
      tx({ id: 'nuevo', date: new Date('2026-09-01T00:00:00Z') }),
    ], lentDebt);

    expect(candidates.map(c => c.id)).toEqual(['nuevo', 'viejo']);
  });

  it('respeta el límite', () => {
    const many = Array.from({ length: 40 }, (_, index) => tx({
      id: `tx-${index}`,
      date: new Date(2026, 0, index + 1),
    }));
    expect(getDebtLinkCandidates(many, lentDebt, 5)).toHaveLength(5);
  });

  it('sin cuenta asociada no hay candidatos', () => {
    const noAccount: Debt = { ...lentDebt, accountId: undefined };
    expect(getDebtLinkCandidates([tx({ id: 'ok' })], noAccount)).toEqual([]);
  });
});
