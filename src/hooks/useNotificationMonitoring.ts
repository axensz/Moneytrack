/**
 * Hook orchestrator for notification monitoring
 * Integrates all monitors and triggers evaluations based on data changes
 *
 * Fix #2: Monitors now update their deps when data changes (no stale data)
 * Fix #3: Transaction detection uses ID-based diffing instead of slice
 */

import { useEffect, useRef } from 'react';
import { BudgetMonitor } from '../services/BudgetMonitor';
import { PaymentMonitor } from '../services/PaymentMonitor';
import { SpendingAnalyzer } from '../services/SpendingAnalyzer';
import { BalanceMonitor } from '../services/BalanceMonitor';
import { DebtMonitor } from '../services/DebtMonitor';
import { NotificationManager } from '../services/NotificationManager';
import { logger } from '../utils/logger';
import { isBatchImporting } from '../utils/importBatchFlag';
import type {
    Transaction,
    Budget,
    RecurringPayment,
    Account,
    Debt,
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
    const prevTransactionIdsRef = useRef<Set<string>>(new Set());
    const dailyCheckDoneRef = useRef<boolean>(false);
    const monitorsInitializedRef = useRef<boolean>(false);

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

    // Initialize monitors once
    useEffect(() => {
        if (!notificationManager) return;
        if (monitorsInitializedRef.current) return;

        const preferences = notificationManager.deps?.preferences;
        if (!preferences) return;

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

        monitorsInitializedRef.current = true;
        logger.info('Notification monitors initialized');
    }, [notificationManager]);

    // Fix #2: Keep monitor deps in sync with current data
    useEffect(() => {
        const m = monitorsRef.current;
        if (!m.budgetMonitor) return;

        const preferences = notificationManager?.deps?.preferences;
        if (!preferences) return;

        m.budgetMonitor.deps = {
            ...m.budgetMonitor.deps,
            budgets,
            transactions,
            preferences,
        };
        m.paymentMonitor!.deps = {
            ...m.paymentMonitor!.deps,
            recurringPayments,
            transactions,
        };
        m.spendingAnalyzer!.deps = {
            ...m.spendingAnalyzer!.deps,
            transactions,
            preferences,
        };
        m.balanceMonitor!.deps = {
            ...m.balanceMonitor!.deps,
            accounts,
            transactions,
            preferences,
        };
        m.debtMonitor!.deps = {
            ...m.debtMonitor!.deps,
            debts,
        };
    }, [transactions, budgets, recurringPayments, accounts, debts, notificationManager]);

    // Run daily checks on mount
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
    }, []);

    // Fix #3: Detect new transactions by comparing IDs, not array slicing
    useEffect(() => {
        const currentIds = new Set(transactions.map(t => t.id).filter(Boolean) as string[]);
        const prevIds = prevTransactionIdsRef.current;

        // Skip initial load
        if (prevIds.size === 0 && currentIds.size > 0) {
            prevTransactionIdsRef.current = currentIds;
            return;
        }

        // Find truly new transaction IDs
        const newIds = [...currentIds].filter(id => !prevIds.has(id));

        if (newIds.length > 0) {
            // Skip individual alerts during batch import — summary is generated by the import hook
            if (isBatchImporting()) {
                prevTransactionIdsRef.current = currentIds;
                return;
            }

            const newTransactions = transactions.filter(t => t.id && newIds.includes(t.id));

            newTransactions.forEach(async (transaction) => {
                try {
                    if (monitorsRef.current.budgetMonitor) {
                        await monitorsRef.current.budgetMonitor.evaluateBudgetAlerts(transaction);
                    }
                    if (monitorsRef.current.spendingAnalyzer) {
                        await monitorsRef.current.spendingAnalyzer.evaluateUnusualSpending(transaction);
                    }
                    if (monitorsRef.current.balanceMonitor && transaction.accountId) {
                        await monitorsRef.current.balanceMonitor.evaluateBalanceAlerts(transaction.accountId);
                        if (transaction.type === 'transfer' && transaction.toAccountId) {
                            await monitorsRef.current.balanceMonitor.evaluateBalanceAlerts(transaction.toAccountId);
                        }
                    }
                } catch (error) {
                    logger.error('Transaction evaluation failed', { transaction, error });
                }
            });
        }

        prevTransactionIdsRef.current = currentIds;
    }, [transactions]);

    // Cleanup caches periodically
    useEffect(() => {
        const cleanupInterval = setInterval(() => {
            try {
                monitorsRef.current.budgetMonitor?.cleanupCache();
                monitorsRef.current.spendingAnalyzer?.cleanupCache();
                monitorsRef.current.balanceMonitor?.cleanupCooldowns();
                notificationManager?.cleanupDebounceMap();
            } catch (error) {
                logger.error('Notification monitoring cleanup failed', error);
            }
        }, 5 * 60 * 1000);

        return () => clearInterval(cleanupInterval);
    }, [notificationManager]);

    return {
        monitors: monitorsRef.current,
    };
}
