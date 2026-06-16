/**
 * BalanceMonitor - Monitors account balances and generates low balance alerts
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 14.4, 14.5
 */

import { logger } from '../utils/logger';
import { BalanceCalculator } from '../utils/balanceCalculator';
import { formatCurrency } from '../utils/formatters';
import type { Account, Transaction, Notification, NotificationPreferences } from '../types/finance';

interface BalanceMonitorDeps {
    createNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => Promise<void>;
    preferences: NotificationPreferences;
    accounts: Account[];
    transactions: Transaction[];
}

export class BalanceMonitor {
    public deps: BalanceMonitorDeps;
    private cooldownMap: Map<string, number> = new Map();
    private readonly COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

    constructor(deps: BalanceMonitorDeps) {
        this.deps = deps;
    }

    /**
     * Evaluate balance alerts for an account
     * Called when a transaction affects an account
     */
    async evaluateBalanceAlerts(accountId: string): Promise<void> {
        try {
            const account = this.deps.accounts.find((a) => a.id === accountId);
            if (!account) {
                logger.warn('Account not found for balance evaluation', { accountId });
                return;
            }

            // Check cooldown
            if (this.isInCooldown(accountId)) {
                logger.info('Balance alert in cooldown period', { accountId });
                return;
            }

            // Calculate current balance
            const balance = this.getAccountBalance(accountId);
            const threshold = this.getBalanceThreshold(account);
            const isCredit = account.type === 'credit';

            // threshold > 0: una TC sin límite (o lowBalance=0) no tiene umbral
            // con sentido. Para una TC el "balance" es el cupo disponible.
            if (threshold > 0 && balance < threshold) {
                await this.deps.createNotification({
                    type: 'low_balance',
                    title: isCredit ? `Cupo casi agotado: ${account.name}` : `Saldo bajo: ${account.name}`,
                    message: isCredit
                        ? `Te queda ${formatCurrency(balance)} de cupo disponible en ${account.name}`
                        : `El saldo de ${formatCurrency(balance)} está por debajo del umbral de ${formatCurrency(threshold)}`,
                    severity: 'warning',
                    isRead: false,
                    actionUrl: `/accounts`,
                    metadata: {
                        accountId,
                        amount: balance,
                        threshold,
                    },
                });

                // Set cooldown
                this.cooldownMap.set(accountId, Date.now());
            } else {
                // Balance is above threshold, reset cooldown
                this.cooldownMap.delete(accountId);
            }
        } catch (error) {
            logger.error('Balance monitor evaluation failed', { accountId, error });
        }
    }

    /**
     * Get account balance using the same logic as accounts display
     */
    getAccountBalance(accountId: string): number {
        const account = this.deps.accounts.find((a) => a.id === accountId);
        if (!account) {
            return 0;
        }

        return BalanceCalculator.calculateAccountBalance(account, this.deps.transactions);
    }

    /**
     * Get balance threshold for an account
     * Uses custom threshold if configured, otherwise uses defaults based on account type
     */
    getBalanceThreshold(account: Account): number {
        // For now, use the default threshold from preferences
        // In the future, could support per-account custom thresholds
        const defaultThreshold = this.deps.preferences.thresholds.lowBalance;

        // Apply different defaults based on account type
        if (account.type === 'credit') {
            // "Saldo bajo" en una TC = cupo casi agotado. El cupo disponible está
            // clampeado a >=0 (CreditCardStrategy), así que el umbral 0 anterior
            // nunca disparaba (código muerto, #4). Avisamos cuando queda menos del
            // 10% del límite disponible.
            // ponytail: 10% fijo; exponer en preferences.thresholds si se pide configurable.
            const limit = account.creditLimit ?? 0;
            return limit > 0 ? limit * 0.1 : 0;
        } else {
            // For savings/cash, use configured threshold (default 100,000 COP)
            return defaultThreshold;
        }
    }

    /**
     * Check if account is in cooldown period
     */
    private isInCooldown(accountId: string): boolean {
        const lastAlert = this.cooldownMap.get(accountId);
        if (!lastAlert) {
            return false;
        }

        const elapsed = Date.now() - lastAlert;
        return elapsed < this.COOLDOWN_MS;
    }

    /**
     * Reset cooldown for an account (useful for testing)
     */
    resetCooldown(accountId: string): void {
        this.cooldownMap.delete(accountId);
    }

    /**
     * Clean up old cooldown entries
     */
    cleanupCooldowns(): void {
        const now = Date.now();
        for (const [accountId, timestamp] of this.cooldownMap.entries()) {
            if (now - timestamp > this.COOLDOWN_MS * 2) {
                this.cooldownMap.delete(accountId);
            }
        }
    }
}
