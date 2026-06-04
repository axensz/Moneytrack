import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mergeCreditCards } from '../../utils/mergeCreditCards';
import { CreditCardCalculator } from '../../utils/balanceCalculator';
import { useCreditCardStatement } from '../../hooks/useCreditCardStatement';
import { useGlobalStats } from '../../hooks/useGlobalStats';
import { useFilteredData } from '../../hooks/useFilteredData';
import { useCreditCardInterests } from '../../components/views/stats/hooks/useCreditCardInterests';
import { buildFinancialContext } from '../../lib/gemini';
import type { Account, Categories, Transaction } from '../../types/finance';

const bank: Account = {
  id: 'bank-1',
  name: 'Banco Principal',
  type: 'savings',
  isDefault: true,
  initialBalance: 2_000_000,
};

const destinationCard: Account = {
  id: 'card-dest',
  name: 'Visa Destino',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 5_000_000,
  cutoffDay: 31,
  paymentDay: 15,
  bankAccountId: bank.id,
  interestRate: 24,
};

const sourceCard: Account = {
  id: 'card-source',
  name: 'Visa Origen Eliminada',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 3_000_000,
  cutoffDay: 31,
  paymentDay: 15,
  bankAccountId: bank.id,
  interestRate: 24,
};

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx',
  type: 'expense',
  amount: 100_000,
  category: 'Compras',
  description: 'Movimiento de prueba',
  date: new Date('2026-06-01T12:00:00Z'),
  paid: true,
  accountId: sourceCard.id!,
  ...overrides,
});

const categories: Categories = {
  expense: ['Compras', 'Electrodomésticos', 'Ajuste manual'],
  income: ['Pago tarjeta'],
};

describe('mergeCreditCards consumers', () => {
  it('moves source-card transactions to the destination card and keeps consumers independent from deleted source accounts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));

    try {
      const transactions: Transaction[] = [
        tx({
          id: 'normal-expense',
          amount: 300_000,
          category: 'Compras',
          description: 'Gasto normal',
        }),
        tx({
          id: 'payment-transfer',
          type: 'transfer',
          amount: 120_000,
          category: 'Pago tarjeta',
          description: 'Pago por transferencia hacia tarjeta',
          accountId: bank.id!,
          toAccountId: sourceCard.id,
        }),
        tx({
          id: 'installment-purchase',
          amount: 1_200_000,
          category: 'Electrodomésticos',
          description: 'Compra en cuotas',
          date: new Date('2026-05-10T12:00:00Z'),
          installments: 6,
          monthlyInstallmentAmount: 220_000,
          totalInterestAmount: 120_000,
          interestRate: 24,
        }),
        tx({
          id: 'manual-debt-adjustment',
          type: 'income',
          amount: 50_000,
          category: 'Ajuste manual',
          description: 'Ajuste manual de deuda',
        }),
      ];

      const merged = mergeCreditCards({
        accounts: [bank, destinationCard, sourceCard],
        transactions,
        destinationCardId: destinationCard.id!,
        sourceCardIds: [sourceCard.id!],
      });

      expect(merged.accounts.map(account => account.id)).toEqual([bank.id, destinationCard.id]);
      expect(merged.destinationCard.bankAccountId).toBe(bank.id);
      expect(merged.destinationCard.mergedAccountIds).toContain(sourceCard.id);
      expect(merged.migratedTransactionCount).toBe(4);
      expect(merged.transactions).toEqual([
        expect.objectContaining({ id: 'normal-expense', accountId: destinationCard.id }),
        expect.objectContaining({ id: 'payment-transfer', accountId: bank.id, toAccountId: destinationCard.id }),
        expect.objectContaining({ id: 'installment-purchase', accountId: destinationCard.id }),
        expect.objectContaining({ id: 'manual-debt-adjustment', accountId: destinationCard.id }),
      ]);

      const mergedCard = merged.destinationCard;
      expect(CreditCardCalculator.calculateUsedCredit(mergedCard, merged.transactions)).toBe(350_000);

      const statement = renderHook(() => useCreditCardStatement(merged.accounts, merged.transactions)).result.current;
      expect(statement).toHaveLength(1);
      expect(statement[0].account.id).toBe(destinationCard.id);
      expect(statement[0].totalCharges).toBe(520_000);
      expect(statement[0].totalPayments).toBe(170_000);
      expect(statement[0].cycleTransactions.map(transaction => transaction.id)).toEqual(
        expect.arrayContaining(['normal-expense', 'payment-transfer', 'installment-purchase', 'manual-debt-adjustment'])
      );

      const globalStats = renderHook(() => useGlobalStats(merged.transactions, merged.accounts)).result.current;
      expect(globalStats.pendingExpenses).toBe(350_000);

      const filtered = renderHook(() => useFilteredData({
        transactions: merged.transactions,
        accounts: merged.accounts,
        filterAccount: destinationCard.id!,
        filterCategory: 'all',
        totalBalance: 0,
        getAccountBalance: () => CreditCardCalculator.calculateAvailableCredit(mergedCard, merged.transactions),
      })).result.current;
      expect(filtered.filteredTransactions).toHaveLength(4);
      expect(filtered.dynamicStats.pendingExpenses).toBe(350_000);

      const interests = renderHook(() => useCreditCardInterests(merged.accounts, merged.transactions)).result.current;
      expect(interests.creditCardInterests).toEqual([
        expect.objectContaining({ id: destinationCard.id, name: destinationCard.name, totalInterest: 120_000 })
      ]);

      const context = buildFinancialContext(merged.transactions, merged.accounts, categories);
      expect(context).toContain('[ID:card-dest] Visa Destino (Crédito): Usado');
      expect(context).toContain('350.000');
      expect(context).toContain('Visa Destino [ACC:card-dest]');
      expect(context).not.toContain('Visa Origen Eliminada');
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves legacy source references through destination mergedAccountIds while source accounts are absent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));

    try {
      const migratedDestination: Account = {
        ...destinationCard,
        mergedAccountIds: [sourceCard.id!],
      };
      const staleTransactions: Transaction[] = [
        tx({ id: 'legacy-expense', accountId: sourceCard.id!, amount: 300_000 }),
        tx({ id: 'legacy-payment', type: 'transfer', accountId: bank.id!, toAccountId: sourceCard.id!, amount: 100_000 }),
      ];

      expect(CreditCardCalculator.calculateUsedCredit(migratedDestination, staleTransactions)).toBe(200_000);

      const statement = renderHook(() => useCreditCardStatement([bank, migratedDestination], staleTransactions)).result.current;
      expect(statement[0].totalCharges).toBe(300_000);
      expect(statement[0].totalPayments).toBe(100_000);

      const globalStats = renderHook(() => useGlobalStats(staleTransactions, [bank, migratedDestination])).result.current;
      expect(globalStats.pendingExpenses).toBe(200_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
