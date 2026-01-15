import { useMemo } from 'react';
import type { Transaction, Account } from '../../../../types/finance';

interface CreditCardInterest {
  id: string;
  name: string;
  interestRate: number;
  monthlyInterest: number;
  yearlyInterest: number;
  totalInterest: number;
  pendingInstallments: number;
  transactionCount: number;
}

interface InterestTotals {
  monthly: number;
  yearly: number;
  total: number;
  pending: number;
}

interface UseCreditCardInterestsReturn {
  creditCardInterests: CreditCardInterest[];
  totals: InterestTotals;
  hasData: boolean;
}

/**
 * Hook para calcular intereses de tarjetas de crédito
 * Extrae la lógica de negocio del componente de UI
 * 
 * Calcula:
 * - Intereses mensuales, anuales y totales por tarjeta
 * - Cuotas pendientes
 * - Totales agregados
 */
export function useCreditCardInterests(
  accounts: Account[],
  transactions: Transaction[]
): UseCreditCardInterestsReturn {
  
  const creditCardInterests = useMemo(() => {
    // Filtrar solo tarjetas de crédito con tasa E.A. configurada
    const creditCards = accounts.filter(
      a => a.type === 'credit' && a.interestRate && a.interestRate > 0
    );

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return creditCards.map(card => {
      // Transacciones de esta tarjeta con intereses
      const cardTransactions = transactions.filter(
        t => t.accountId === card.id && 
             t.type === 'expense' && 
             t.totalInterestAmount && 
             t.totalInterestAmount > 0
      );

      // Filtrar por período
      const filterByPeriod = (txs: Transaction[], filterFn: (date: Date) => boolean) =>
        txs.filter(t => filterFn(new Date(t.date)));

      const monthlyTransactions = filterByPeriod(
        cardTransactions,
        date => date.getMonth() === currentMonth && date.getFullYear() === currentYear
      );

      const yearlyTransactions = filterByPeriod(
        cardTransactions,
        date => date.getFullYear() === currentYear
      );

      // Calcular sumas de intereses
      const sumInterests = (txs: Transaction[]) =>
        txs.reduce((sum, t) => sum + (t.totalInterestAmount || 0), 0);

      const monthlyInterest = sumInterests(monthlyTransactions);
      const yearlyInterest = sumInterests(yearlyTransactions);
      const totalInterest = sumInterests(cardTransactions);

      // Calcular cuotas pendientes
      const pendingInstallments = cardTransactions.reduce((sum, t) => {
        if (t.installments && t.monthlyInstallmentAmount) {
          const txDate = new Date(t.date);
          const monthsPassed = 
            (currentYear - txDate.getFullYear()) * 12 + 
            (currentMonth - txDate.getMonth());
          const remainingInstallments = Math.max(0, t.installments - monthsPassed);
          return sum + (remainingInstallments * t.monthlyInstallmentAmount);
        }
        return sum;
      }, 0);

      return {
        id: card.id!,
        name: card.name,
        interestRate: card.interestRate || 0,
        monthlyInterest,
        yearlyInterest,
        totalInterest,
        pendingInstallments,
        transactionCount: cardTransactions.length,
      };
    });
  }, [accounts, transactions]);

  // Calcular totales agregados
  const totals = useMemo<InterestTotals>(() => ({
    monthly: creditCardInterests.reduce((sum, c) => sum + c.monthlyInterest, 0),
    yearly: creditCardInterests.reduce((sum, c) => sum + c.yearlyInterest, 0),
    total: creditCardInterests.reduce((sum, c) => sum + c.totalInterest, 0),
    pending: creditCardInterests.reduce((sum, c) => sum + c.pendingInstallments, 0),
  }), [creditCardInterests]);

  return {
    creditCardInterests,
    totals,
    hasData: creditCardInterests.length > 0,
  };
}
