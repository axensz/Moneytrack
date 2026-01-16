import { useMemo } from 'react';
import type { Transaction, Account } from '../../../../types/finance';

interface CreditCardInterest {
  id: string;
  name: string;
  interestRate: number;
  monthlyInterest: number;
  yearlyInterest: number;
  totalInterest: number;
  pendingInterest: number;
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
    // Filtrar solo tarjetas de crédito (con o sin tasa E.A.)
    const creditCards = accounts.filter(a => a.type === 'credit');

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return creditCards
      .map(card => {
        // Transacciones de esta tarjeta con intereses
        const cardTransactions = transactions.filter(
          t => t.accountId === card.id && 
               t.type === 'expense' && 
               t.totalInterestAmount && 
               t.totalInterestAmount > 0
        );

        // Si no tiene intereses registrados, no incluir
        if (cardTransactions.length === 0) return null;

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

        // Calcular métricas
        const sumInterests = (txs: Transaction[]) =>
          txs.reduce((sum, t) => sum + (t.totalInterestAmount || 0), 0);

        let monthlyInterest = 0;
        let yearlyInterest = 0;
        const totalInterest = sumInterests(cardTransactions);

        // Iterar transacciones para calcular flujo de intereses
        cardTransactions.forEach(t => {
          if (!t.totalInterestAmount || !t.installments || t.installments <= 0) return;

          const interestPerInstallment = t.totalInterestAmount / t.installments;
          const txDate = new Date(t.date);
          
          // Calcular meses transcurridos hasta el inicio del mes actual
          // (Asumimos que el pago inicia el mes siguiente o el mismo, simplificado a "meses activos")
          const monthsSinceStart = (currentYear - txDate.getFullYear()) * 12 + (currentMonth - txDate.getMonth());
          
          // 1. Cálculo Mensual: ¿Está activa la deuda este mes?
          // Si monthsSinceStart es >= 0 y menor que el total de cuotas, esta cuota toca este mes
          if (monthsSinceStart >= 0 && monthsSinceStart < t.installments) {
            monthlyInterest += interestPerInstallment;
          }

          // 2. Cálculo Anual: ¿Cuántas cuotas caen en este año?
          // Iteramos los 12 meses del año actual
          let installmentsInYear = 0;
          for (let month = 0; month < 12; month++) {
             const monthsDiff = (currentYear - txDate.getFullYear()) * 12 + (month - txDate.getMonth());
             if (monthsDiff >= 0 && monthsDiff < t.installments) {
               installmentsInYear++;
             }
          }
          yearlyInterest += (installmentsInYear * interestPerInstallment);
        });

        // Calcular intereses pendientes (proporcional a cuotas restantes)
        const pendingInterest = cardTransactions.reduce((sum, t) => {
          if (t.installments && t.totalInterestAmount) {
            const txDate = new Date(t.date);
            const monthsPassed = 
              (currentYear - txDate.getFullYear()) * 12 + 
              (currentMonth - txDate.getMonth());
            const remainingInstallments = Math.max(0, t.installments - monthsPassed);
            // Interés pendiente = (cuotas restantes / cuotas totales) * interés total
            const interestPerInstallment = t.totalInterestAmount / t.installments;
            return sum + (remainingInstallments * interestPerInstallment);
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
          pendingInterest,
          transactionCount: cardTransactions.length,
        };
      })
      .filter((card): card is CreditCardInterest => card !== null);
  }, [accounts, transactions]);

  // Calcular totales agregados
  const totals = useMemo<InterestTotals>(() => ({
    monthly: creditCardInterests.reduce((sum, c) => sum + c.monthlyInterest, 0),
    yearly: creditCardInterests.reduce((sum, c) => sum + c.yearlyInterest, 0),
    total: creditCardInterests.reduce((sum, c) => sum + c.totalInterest, 0),
    pending: creditCardInterests.reduce((sum, c) => sum + c.pendingInterest, 0),
  }), [creditCardInterests]);

  return {
    creditCardInterests,
    totals,
    hasData: creditCardInterests.length > 0,
  };
}
