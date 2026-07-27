'use client';

import {
  useAccountDomain,
  useBudgetsDomain,
  useDebtsDomain,
  useRecurringDomain,
  useTransactionDomain,
} from '../../hooks/useFinanceSelectors';
import { useDailyExpenseReminder } from '../../hooks/useDailyExpenseReminder';
import { useNotificationMonitoring } from '../../hooks/useNotificationMonitoring';
import { useNotificationContext } from '../../contexts/NotificationContext';

interface FinanceNotificationBridgeProps {
  userId: string | null;
}

/**
 * Mantiene la suscripción de notificaciones fuera del shell visual.
 * Los cambios de presupuestos/deudas ya no fuerzan un render completo de la app.
 */
export function FinanceNotificationBridge({
  userId,
}: FinanceNotificationBridgeProps) {
  const { transactions, balanceTransactions } = useTransactionDomain();
  const { accounts } = useAccountDomain();
  const { recurringPayments } = useRecurringDomain();
  const { budgets } = useBudgetsDomain();
  const { debts } = useDebtsDomain();
  const {
    notificationManager,
    preferences: notificationPreferences,
  } = useNotificationContext();

  useNotificationMonitoring({
    userId,
    transactions,
    balanceTransactions,
    budgets,
    recurringPayments,
    accounts,
    debts,
    notificationManager,
  });
  useDailyExpenseReminder(notificationManager, notificationPreferences);

  return null;
}
