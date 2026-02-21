/**
 * Hook orchestrator for notification monitoring
 * Integrates all monitors and triggers evaluations based on data changes
 * Validates: Requirements 11.1, 11.2, 11.4
 */

import { useEffect, useRef } from 'react';
import { BudgetMonitor } from '../services/BudgetMonitor';
import { PaymentMonitor } from '../services/PaymentMonitor';
import { SpendingAnalyzer } from '../services/SpendingAnalyzer';
import { BalanceMonitor } from '../services/BalanceMonitor';
import { DebtMonitor } from '../services/DebtMonitor';
import { NotificationManager } from '../services/NotificationManager';
import { logger } from '../utils/logger';
import type {
    Transaction,
    Budget,
    RecurringPayment,
    Account,
    Debt,
    NotificationPreferences,
    Notification,
} from '../types/finance';

interface UseNotificationMonitoringProps {
    userId: string | null;
    transactions: Transaction[];
    budgets: Budget[];
    recurringPayments: RecurringPayment[];
    accounts: Account[];
    debts: Debt[];
    notificationManager: NotificationManager;
}

export function useNotificationMonitoring({
    userId,
    transactions,
    budgets,
    recurringPayments,
    accounts,
    debts,
    notificationManager,
}: UseNotificationMonitoringProps) {
    // Track previous transaction count to detect changes
    const prevTransactionCountRef = useRef<number>(0);
    const dailyCheckDoneRef = useRef<boolean>(false);
    const monitorsRef = useRef<{
        budgetMonitor: BudgetMonitor | null;
        paymentMonitor: PaymentMonitor | null;
        spendingAnalyzer: SpendingAnalyzer | null;
        balanceMonitor: BalanceMonitor | null;
        debtMonitor: DebtMonitor | null;
    }>({
        budgetMonitor: null,
        paymentMonitor: null,
        spendingAnalyzer: null,
        balanceMonitor: null,
        debtMonitor: null,
    });

    // Initialize monitors when dependencies change
    useEffect(() => {
        if (!notificationManager) return;

        const preferences = notificationManager.deps?.preferences;
        if (!preferences) return;

        // Create monitor instances
        monitorsRef.current.budgetMonitor = new BudgetMonitor({
            createNotification: (n) => notificationManager.createNotification(n),
            preferences,
            budgets,
            transactions,
        });

        monitorsRef.current.paymentMonitor = new PaymentMonitor({
            createNotification: (n) => notificationManager.createNotification(n),
            recurringPayments,
            transactions,
        });

        monitorsRef.current.spendingAnalyzer = new SpendingAnalyzer({
            createNotification: (n) => notificationManager.createNotification(n),
            preferences,
            transactions,
        });

        monitorsRef.current.balanceMonitor = new BalanceMonitor({
            createNotification: (n) => notificationManager.createNotification(n),
            preferences,
            accounts,
            transactions,
        });

        monitorsRef.current.debtMonitor = new DebtMonitor({
            createNotification: (n) => notificationManager.createNotification(n),
            debts,
        });

        logger.info('Notification monitors initialized');
    }, [notificationManager, budgets, transactions, recurringPayments, accounts, debts]);

    // Run daily checks on mount (payments and debts)
    useEffect(() => {
        if (dailyCheckDoneRef.current) return;
        if (!monitorsRef.current.paymentMonitor || !monitorsRef.current.debtMonitor) return;

        const runDailyChecks = async () => {
            try {
                logger.info('Running daily notification checks');

                await monitorsRef.current.paymentMonitor?.checkUpcomingPayments();
                await monitorsRef.current.debtMonitor?.checkOverdueDebts();

                dailyCheckDoneRef.current = true;
                logger.info('Daily notification checks completed');
            } catch (error) {
                logger.error('Daily notification checks failed', error);
            }
        };

        runDailyChecks();
    }, [monitorsRef.current.paymentMonitor, monitorsRef.current.debtMonitor]);

    // Monitor transaction changes and trigger evaluations
    useEffect(() => {
        const currentCount = transactions.length;
        const prevCount = prevTransactionCountRef.current;

        // Skip initial load
        if (prevCount === 0 && currentCount > 0) {
            prevTransactionCountRef.current = currentCount;
            return;
        }

        // Detect new or modified transactions
        if (currentCount !== prevCount) {
            const newTransactions = transactions.slice(0, currentCount - prevCount);

            // Evaluate each new transaction
            newTransactions.forEach(async (transaction) => {
                try {
                    // Budget alerts
                    if (monitorsRef.current.budgetMonitor) {
                        await monitorsRef.current.budgetMonitor.evaluateBudgetAlerts(transaction);
                    }

                    // Unusual spending alerts
                    if (monitorsRef.current.spendingAnalyzer) {
                        await monitorsRef.current.spendingAnalyzer.evaluateUnusualSpending(transaction);
                    }

                    // Balance alerts (for affected accounts)
                    if (monitorsRef.current.balanceMonitor && transaction.accountId) {
                        await monitorsRef.current.balanceMonitor.evaluateBalanceAlerts(transaction.accountId);

                        // Also check toAccountId for transfers
                        if (transaction.type === 'transfer' && transaction.toAccountId) {
                            await monitorsRef.current.balanceMonitor.evaluateBalanceAlerts(transaction.toAccountId);
                        }
                    }
                } catch (error) {
                    logger.error('Transaction evaluation failed', { transaction, error });
                }
            });

            prevTransactionCountRef.current = currentCount;
        }
    }, [transactions]);

    // Cleanup: periodically clean up caches and debounce maps
    useEffect(() => {
        const cleanupInterval = setInterval(() => {
            try {
                monitorsRef.current.budgetMonitor?.cleanupCache();
                monitorsRef.current.spendingAnalyzer?.cleanupCache();
                monitorsRef.current.balanceMonitor?.cleanupCooldowns();
                notificationManager?.cleanupDebounceMap();
                logger.info('Notification monitoring cleanup completed');
            } catch (error) {
                logger.error('Notification monitoring cleanup failed', error);
            }
        }, 5 * 60 * 1000); // Every 5 minutes

        return () => clearInterval(cleanupInterval);
    }, [notificationManager]);

    return {
        monitors: monitorsRef.current,
    };
}
