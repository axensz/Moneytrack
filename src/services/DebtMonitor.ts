/**
 * DebtMonitor - Monitors unsettled debts and generates periodic reminders
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 14.5
 */

import { logger } from '../utils/logger';
import { formatCurrency } from '../utils/formatters';
import type { Debt } from '../types/finance';

interface DebtMonitorDeps {
    createNotification: (notification: any) => Promise<void>;
    debts: Debt[];
}

export class DebtMonitor {
    private deps: DebtMonitorDeps;
    private lastCheckDate: Date | null = null;
    private lastReminderMap: Map<string, number> = new Map(); // debtId -> timestamp

    constructor(deps: DebtMonitorDeps) {
        this.deps = deps;
    }

    /**
     * Check for overdue debts and generate reminders
     * Should be called daily on app initialization
     */
    async checkOverdueDebts(): Promise<void> {
        try {
            // Only run once per day
            if (this.lastCheckDate) {
                const today = new Date();
                const lastCheck = this.lastCheckDate;
                if (
                    today.getDate() === lastCheck.getDate() &&
                    today.getMonth() === lastCheck.getMonth() &&
                    today.getFullYear() === lastCheck.getFullYear()
                ) {
                    logger.info('Debt check already run today, skipping');
                    return;
                }
            }

            const unsettledDebts = this.deps.debts.filter((d) => !d.isSettled);

            for (const debt of unsettledDebts) {
                if (!debt.id) continue;

                const daysOutstanding = this.getDaysOutstanding(debt);

                // Check if we should send a reminder (avoid daily spam)
                if (!this.shouldSendReminder(debt.id, daysOutstanding)) {
                    continue;
                }

                // Generate reminders based on debt type and days outstanding
                if (debt.type === 'borrowed') {
                    // Borrowed debts: remind at 30 and 60 days
                    if (daysOutstanding >= 60) {
                        await this.deps.createNotification({
                            type: 'debt',
                            title: `Deuda pendiente: ${debt.personName}`,
                            message: `Debes ${formatCurrency(debt.remainingAmount)} a ${debt.personName} desde hace ${daysOutstanding} días`,
                            severity: 'warning',
                            isRead: false,
                            actionUrl: `/debts`,
                            metadata: {
                                debtId: debt.id,
                                amount: debt.remainingAmount,
                            },
                        });
                        this.lastReminderMap.set(debt.id, Date.now());
                    } else if (daysOutstanding >= 30) {
                        await this.deps.createNotification({
                            type: 'debt',
                            title: `Recordatorio de deuda: ${debt.personName}`,
                            message: `Debes ${formatCurrency(debt.remainingAmount)} a ${debt.personName} desde hace ${daysOutstanding} días`,
                            severity: 'info',
                            isRead: false,
                            actionUrl: `/debts`,
                            metadata: {
                                debtId: debt.id,
                                amount: debt.remainingAmount,
                            },
                        });
                        this.lastReminderMap.set(debt.id, Date.now());
                    }
                } else if (debt.type === 'lent') {
                    // Lent debts: remind at 90 days
                    if (daysOutstanding >= 90) {
                        await this.deps.createNotification({
                            type: 'debt',
                            title: `Préstamo pendiente: ${debt.personName}`,
                            message: `${debt.personName} te debe ${formatCurrency(debt.remainingAmount)} desde hace ${daysOutstanding} días`,
                            severity: 'info',
                            isRead: false,
                            actionUrl: `/debts`,
                            metadata: {
                                debtId: debt.id,
                                amount: debt.remainingAmount,
                            },
                        });
                        this.lastReminderMap.set(debt.id, Date.now());
                    }
                }
            }

            this.lastCheckDate = new Date();
            logger.info('Debt check completed', { debtsChecked: unsettledDebts.length });
        } catch (error) {
            logger.error('Debt monitor check failed', error);
        }
    }

    /**
     * Calculate days since debt was created
     */
    getDaysOutstanding(debt: Debt): number {
        if (!debt.createdAt) {
            return 0;
        }

        const now = new Date();
        const created = new Date(debt.createdAt);
        const diffTime = now.getTime() - created.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        return diffDays;
    }

    /**
     * Check if we should send a reminder for this debt
     * Avoid sending reminders too frequently (weekly after initial alert)
     */
    private shouldSendReminder(debtId: string, daysOutstanding: number): boolean {
        const lastReminder = this.lastReminderMap.get(debtId);

        // If never reminded, check if we've reached a threshold
        if (!lastReminder) {
            return daysOutstanding >= 30 || daysOutstanding >= 60 || daysOutstanding >= 90;
        }

        // If reminded before, wait at least 7 days before next reminder
        const daysSinceLastReminder = Math.floor((Date.now() - lastReminder) / (1000 * 60 * 60 * 24));
        return daysSinceLastReminder >= 7;
    }

    /**
     * Reset last check date (useful for testing)
     */
    resetLastCheck(): void {
        this.lastCheckDate = null;
    }

    /**
     * Clear reminder history (useful for testing)
     */
    clearReminderHistory(): void {
        this.lastReminderMap.clear();
    }
}
