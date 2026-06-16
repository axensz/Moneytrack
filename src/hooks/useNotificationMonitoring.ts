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
import { shouldSuppressNotification } from '../utils/importBatchFlag';
import { ensureDate } from '../utils/dateUtils';

// Ventana de "recién creada": una transacción cuyo createdAt es más viejo que
// esto NO dispara alertas individuales aunque su id acabe de entrar al array
// (entró por paginación/"Cargar más", no porque el usuario la registrara).
//
// 30 min, no 2 min (#5): el createdAt lo estampa el dispositivo que crea la tx,
// pero la ventana se evalúa con el Date.now() de ESTE dispositivo. Con desfase
// de reloj entre dispositivos o latencia del listener (reconexión, pestaña en
// segundo plano), una tx legítima de otro dispositivo llegaba con createdAt
// "viejo" y se descartaba con la ventana de 2 min → alertas reales perdidas.
// 30 min tolera ese desfase y sigue excluyendo el historial paginado: la tx
// nº 501 (la que aflora al paginar o al borrar una reciente) tiene días/semanas.
// ponytail: ceiling = un reloj > 30 min desfasado aún pierde la alerta; si pasa,
// la señal robusta sería marcar el origen del id (alta vs page-in), no el reloj.
const FRESH_CREATION_MS = 30 * 60 * 1000;
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
    /**
     * Historial COMPLETO para cálculos de saldo (C-FIX paginación + saldos).
     * BalanceMonitor deriva saldos de ahorro/efectivo sumando transacciones;
     * con la ventana paginada de 500 el saldo evaluado sería incorrecto.
     * Si no se pasa, cae al array `transactions`.
     */
    balanceTransactions?: Transaction[];
    budgets: Budget[];
    recurringPayments: RecurringPayment[];
    accounts: Account[];
    debts: Debt[];
    notificationManager: NotificationManager;
}

export function useNotificationMonitoring({
    userId,
    transactions,
    balanceTransactions,
    budgets,
    recurringPayments,
    accounts,
    debts,
    notificationManager,
}: UseNotificationMonitoringProps) {
    const txsForBalance = balanceTransactions ?? transactions;
    const prevTransactionIdsRef = useRef<Set<string>>(new Set());
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
            // Historial COMPLETO: el gasto del mes se subcontaría sobre la ventana
            // paginada de 500 para un usuario de alto volumen → alerta que no
            // dispara (falso negativo). Mismo motivo que balanceMonitor (#6).
            transactions: txsForBalance,
        });

        monitorsRef.current.paymentMonitor = new PaymentMonitor({
            createNotification: (n) => notificationManager.createNotification(n),
            recurringPayments,
            transactions,
        });

        monitorsRef.current.spendingAnalyzer = new SpendingAnalyzer({
            createNotification: (n) => notificationManager.createNotification(n),
            preferences,
            // Historial COMPLETO: el promedio de 90 días sería incorrecto sobre la
            // ventana paginada (#6).
            transactions: txsForBalance,
        });

        monitorsRef.current.balanceMonitor = new BalanceMonitor({
            createNotification: (n) => notificationManager.createNotification(n),
            preferences,
            accounts,
            transactions: txsForBalance,
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
            transactions: txsForBalance, // historial completo (#6)
            preferences,
        };
        m.paymentMonitor!.deps = {
            ...m.paymentMonitor!.deps,
            recurringPayments,
            transactions,
        };
        m.spendingAnalyzer!.deps = {
            ...m.spendingAnalyzer!.deps,
            transactions: txsForBalance, // historial completo (#6)
            preferences,
        };
        m.balanceMonitor!.deps = {
            ...m.balanceMonitor!.deps,
            accounts,
            transactions: txsForBalance,
            preferences,
        };
        m.debtMonitor!.deps = {
            ...m.debtMonitor!.deps,
            debts,
        };
    }, [transactions, txsForBalance, budgets, recurringPayments, accounts, debts, notificationManager]);

    // Daily checks (pagos próximos / deudas vencidas): al montar y al volver a la
    // pestaña. En sesiones largas (PWA/pestaña abierta varios días) el efecto de
    // solo-mount no re-evaluaba hasta recargar (#3). Los monitores tienen su
    // propio guard once-per-day (lastCheckDate), así que re-invocar es
    // idempotente: solo dispara al cruzar de día.
    useEffect(() => {
        const runDailyChecks = async () => {
            if (!monitorsRef.current.paymentMonitor || !monitorsRef.current.debtMonitor) return;
            try {
                await monitorsRef.current.paymentMonitor?.checkUpcomingPayments();
                await monitorsRef.current.debtMonitor?.checkOverdueDebts();
            } catch (error) {
                logger.error('Daily notification checks failed', error);
            }
        };

        runDailyChecks();

        if (typeof document === 'undefined') return;
        const onVisible = () => {
            if (document.visibilityState === 'visible') runDailyChecks();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [notificationManager]);

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
            // Skip individual alerts during batch import or grace period after import
            if (shouldSuppressNotification()) {
                prevTransactionIdsRef.current = currentIds;
                return;
            }

            // Solo alertar sobre transacciones recién CREADAS por el usuario
            // (createdAt fresco). Un id "nuevo" en el array también aparece cuando
            // la PAGINACIÓN carga transacciones antiguas ("Cargar más" añade cientos
            // de ids de golpe) → sin este guard, cada tx histórica disparaba alertas
            // de gasto inusual/presupuesto como si fuera nueva (flood reportado).
            // Sin createdAt (docs legacy, solo llegan vía paginación) → suprimir.
            const newTransactions = transactions.filter(t => {
                if (!t.id || !newIds.includes(t.id)) return false;
                if (!t.createdAt) return false;
                const createdMs = ensureDate(t.createdAt).getTime();
                return Date.now() - createdMs < FRESH_CREATION_MS;
            });

            newTransactions.forEach(async (transaction) => {
                // Double-check per transaction in case only some are from import
                if (shouldSuppressNotification(transaction.id)) return;

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
