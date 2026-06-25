import { useMemo } from 'react';
import type { Account, Transaction, RecurringPayment } from '../types/finance';
import { buildCardPaymentSchedule } from '../utils/cardPaymentSchedule';

export type {
  MonthGroup, CardMonthPayment, CycleStatus, InstallmentItem, RecurringItem,
} from '../utils/cardPaymentSchedule';

/** Calendario de pagos de tarjetas (extractos), memoizado. */
export function useCardPaymentSchedule(
  accounts: Account[],
  transactions: Transaction[],
  recurringPayments: RecurringPayment[],
) {
  return useMemo(
    () => buildCardPaymentSchedule(accounts, transactions, recurringPayments),
    [accounts, transactions, recurringPayments],
  );
}
