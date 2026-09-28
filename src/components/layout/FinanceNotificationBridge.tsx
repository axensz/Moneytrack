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
import { useNotificationAuthority } from '../../hooks/useNotificationAuthority';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { isForegroundWriter } from '../../utils/notificationAuthority';

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
  const {
    transactions,
    balanceTransactions,
    balancesReady,
    transactionsLoading,
    notificationSourcesHydrated,
  } = useTransactionDomain();
  const { accounts } = useAccountDomain();
  const { recurringPayments } = useRecurringDomain();
  const { budgets } = useBudgetsDomain();
  const { debts } = useDebtsDomain();
  const {
    notificationManager,
    preferences: notificationPreferences,
  } = useNotificationContext();

  // Task 3: la autoridad admitida decide si el escritor foreground puede evaluar
  // time-events (daily/recurring/debt). Durable y cutover (writer null) los
  // fencean; presupuesto/gasto/saldo por transacción no se gatean.
  const authority = useNotificationAuthority(userId);
  const foregroundWriterActive = isForegroundWriter(authority);

  useNotificationMonitoring({
    userId,
    transactions,
    balanceTransactions,
    budgets,
    recurringPayments,
    accounts,
    debts,
    notificationManager,
    isHydrated: !transactionsLoading && balancesReady && notificationSourcesHydrated,
    foregroundWriterActive,
    authority,
  });
  useDailyExpenseReminder(notificationManager, notificationPreferences, {
    foregroundWriterActive,
    authority,
  });

  return null;
}
