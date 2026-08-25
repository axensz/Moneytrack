import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../config/constants';
import type { Debt, Transaction } from '../types/finance';
import { roundMoney } from './formatters';

interface DebtAwareTransactionDeleteDeps {
  userId: string | null;
  transactions: readonly Transaction[];
  debts: readonly Debt[];
  deleteTransaction: (id: string) => Promise<Transaction | null>;
  deleteDebt: (id: string) => Promise<void>;
  updateDebt: (id: string, updates: Partial<Debt>) => Promise<void>;
}

export const executeDebtAwareTransactionDelete = async (
  id: string,
  {
    userId,
    transactions,
    debts,
    deleteTransaction,
    deleteDebt,
    updateDebt,
  }: DebtAwareTransactionDeleteDeps,
): Promise<Transaction | null> => {
  const transaction = transactions.find(candidate => candidate.id === id);
  const debt = transaction?.debtId
    ? debts.find(candidate => candidate.id === transaction.debtId)
    : undefined;

  if (!userId && transaction?.debtId && !debt) {
    throw new Error('La deuda asociada ya no existe. Concilia el préstamo antes de borrar el movimiento.');
  }

  if (
    transaction?.debtId
    && transaction.category === LOAN_CATEGORY
  ) {
    await deleteDebt(transaction.debtId);
    return transaction;
  }

  if (
    transaction?.debtId
    && transaction.category === LOAN_PAYMENT_CATEGORY
  ) {
    const deleted = await deleteTransaction(id);
    if (!userId && debt && deleted) {
      await updateDebt(debt.id!, {
        remainingAmount: roundMoney(debt.remainingAmount + deleted.amount),
        isSettled: false,
        settledAt: undefined,
      });
    }
    return deleted;
  }

  return deleteTransaction(id);
};
