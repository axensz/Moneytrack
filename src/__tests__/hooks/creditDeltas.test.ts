/**
 * Fase 1 — usedCredit es el campo autoritativo de la deuda de una TC. Estas
 * pruebas cubren exhaustivamente el cálculo de deltas que alimenta las
 * reversiones atómicas en alta/baja/edición y en la cascada de borrado de cuenta:
 *
 *  (a) borrar una transferencia que pagaba una TC debe revertir usedCredit
 *      (la transferencia restó `amount`; la reversión es increment(+amount));
 *  (b) editar un gasto de TC de 100000 a 500000 produce el delta correcto.
 */
import { describe, it, expect } from 'vitest';
import { getCreditDelta, creditDeltasByAccount } from '../../utils/creditDeltas';
import type { Account, Transaction } from '../../types/finance';

const creditCard: Account = {
  id: 'cc-1',
  name: 'Visa',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  createdAt: new Date('2026-01-01'),
};

const savings: Account = {
  id: 'sav-1',
  name: 'Ahorros',
  type: 'savings',
  isDefault: false,
  initialBalance: 0,
  createdAt: new Date('2026-01-01'),
};

const accounts: Account[] = [creditCard, savings];

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 't',
    type: 'expense',
    amount: 0,
    category: 'Test',
    description: '',
    date: new Date('2026-01-01'),
    paid: true,
    accountId: 'cc-1',
    createdAt: new Date('2026-01-01'),
    ...partial,
  } as Transaction;
}

describe('getCreditDelta', () => {
  it('expense on the account increases debt (+amount)', () => {
    expect(getCreditDelta({ type: 'expense', amount: 100, accountId: 'cc-1' }, 'cc-1')).toBe(100);
  });

  it('income on the account reduces debt (-amount)', () => {
    expect(getCreditDelta({ type: 'income', amount: 100, accountId: 'cc-1' }, 'cc-1')).toBe(-100);
  });

  it('transfer INTO the account reduces debt (-amount)', () => {
    expect(
      getCreditDelta({ type: 'transfer', amount: 100, accountId: 'sav-1', toAccountId: 'cc-1' }, 'cc-1')
    ).toBe(-100);
  });

  it('returns 0 when the account is not involved', () => {
    expect(getCreditDelta({ type: 'expense', amount: 100, accountId: 'other' }, 'cc-1')).toBe(0);
    expect(
      getCreditDelta({ type: 'transfer', amount: 100, accountId: 'cc-1', toAccountId: 'sav-1' }, 'cc-1')
    ).toBe(0);
  });

  it('transfer OUT of the account does not affect its usedCredit', () => {
    expect(
      getCreditDelta({ type: 'transfer', amount: 100, accountId: 'cc-1', toAccountId: 'sav-1' }, 'cc-1')
    ).toBe(0);
  });
});

describe('creditDeltasByAccount', () => {
  it('expense on a credit card maps to +amount for that card', () => {
    const deltas = creditDeltasByAccount(tx({ type: 'expense', amount: 100000, accountId: 'cc-1' }), accounts);
    expect(deltas.get('cc-1')).toBe(100000);
    expect(deltas.size).toBe(1);
  });

  it('income on a credit card maps to -amount', () => {
    const deltas = creditDeltasByAccount(tx({ type: 'income', amount: 50000, accountId: 'cc-1' }), accounts);
    expect(deltas.get('cc-1')).toBe(-50000);
  });

  it('does NOT write usedCredit for non-credit accounts', () => {
    const deltas = creditDeltasByAccount(tx({ type: 'expense', amount: 100, accountId: 'sav-1' }), accounts);
    expect(deltas.size).toBe(0);
  });

  it('transfer into a credit card (a payment) maps to -amount', () => {
    const deltas = creditDeltasByAccount(
      tx({ type: 'transfer', amount: 200000, accountId: 'sav-1', toAccountId: 'cc-1' }),
      accounts
    );
    expect(deltas.get('cc-1')).toBe(-200000);
  });

  it('transfer to a non-credit account produces no deltas', () => {
    const deltas = creditDeltasByAccount(
      tx({ type: 'transfer', amount: 200000, accountId: 'cc-1', toAccountId: 'sav-1' }),
      accounts
    );
    expect(deltas.size).toBe(0);
  });

  // (a) Borrar una transferencia que pagaba una TC revierte usedCredit.
  it('(a) deleting a transfer that paid a credit card reverts usedCredit by +amount', () => {
    const payment = tx({ type: 'transfer', amount: 200000, accountId: 'sav-1', toAccountId: 'cc-1' });
    const deltas = creditDeltasByAccount(payment, accounts);
    // El delta original fue -amount; la reversión de borrado aplica increment(-delta) => +amount.
    const reversal = -(deltas.get('cc-1') ?? 0);
    expect(reversal).toBe(200000);
  });

  // (b) Editar un gasto de TC de 100000 a 500000 produce el delta correcto.
  it('(b) editing a credit-card expense from 100000 to 500000 yields diff +400000', () => {
    const oldTx = tx({ type: 'expense', amount: 100000, accountId: 'cc-1' });
    const newTx = { ...oldTx, amount: 500000 } as Transaction;

    const oldDeltas = creditDeltasByAccount(oldTx, accounts);
    const newDeltas = creditDeltasByAccount(newTx, accounts);

    const diff = (newDeltas.get('cc-1') ?? 0) - (oldDeltas.get('cc-1') ?? 0);
    expect(oldDeltas.get('cc-1')).toBe(100000);
    expect(newDeltas.get('cc-1')).toBe(500000);
    expect(diff).toBe(400000);
  });

  it('resolves merged account ids to the canonical credit card', () => {
    const merged: Account = { ...creditCard, id: 'cc-canonical', mergedAccountIds: ['cc-old'] };
    const deltas = creditDeltasByAccount(
      tx({ type: 'expense', amount: 100, accountId: 'cc-old' }),
      [merged, savings]
    );
    expect(deltas.get('cc-canonical')).toBe(100);
  });
});
