/**
 * PaymentMonitor - Monitors recurring payment due dates and generates reminders
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 14.2, 14.5
 */

import { logger } from '../utils/logger';
import { formatCurrency } from '../utils/formatters';
import type { RecurringPayment, Transaction } from '../types/finance';

interface PaymentMonitorDeps {
    createNotification: (notification: any) => Promise<void>;
    recurringPayments: RecurringPayment[];
    transactions: Transaction[];
}

export class PaymentMonitor {
    private deps: PaymentMonitorDeps;
    private lastCheckDate: Date | null = null;

    constructor(deps: PaymentMonitorDeps) {
        this.deps = deps;
    }

    /**
     * Check for upcoming payments and generate reminders
     * Should be called daily on app initialization
     */
    async checkUpcomingPayments(): Promise<void> {
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
                    logger.info('Payment check already run today, skipping');
                    return;
                }
            }

            const activePayments = this.deps.recurringPayments.filter((p) => p.isActive);

            for (const payment of activePayments) {
                if (!payment.id) continue;

                const daysUntilDue = this.getDaysUntilDue(payment);
                const isPaid = this.isAlreadyPaid(payment);

                if (isPaid) {
                    continue; // Skip if already paid for current period
                }

                // Generate reminders based on days until due
                if (daysUntilDue === 0) {
                    // Due today
                    await this.deps.createNotification({
                        type: 'recurring',
                        title: `Pago vence hoy: ${payment.name}`,
                        message: `El pago de ${formatCurrency(payment.amount)} vence hoy`,
                        severity: 'warning',
                        isRead: false,
                        actionUrl: `/recurring`,
                        metadata: {
                            recurringPaymentId: payment.id,
                            amount: payment.amount,
                        },
                    });
                } else if (daysUntilDue === 1) {
                    // Due tomorrow
                    await this.deps.createNotification({
                        type: 'recurring',
                        title: `Pago vence mañana: ${payment.name}`,
                        message: `El pago de ${formatCurrency(payment.amount)} vence mañana`,
                        severity: 'warning',
                        isRead: false,
                        actionUrl: `/recurring`,
                        metadata: {
                            recurringPaymentId: payment.id,
                            amount: payment.amount,
                        },
                    });
                } else if (daysUntilDue === 3) {
                    // Due in 3 days
                    await this.deps.createNotification({
                        type: 'recurring',
                        title: `Recordatorio: ${payment.name}`,
                        message: `El pago de ${formatCurrency(payment.amount)} vence en 3 días`,
                        severity: 'info',
                        isRead: false,
                        actionUrl: `/recurring`,
                        metadata: {
                            recurringPaymentId: payment.id,
                            amount: payment.amount,
                        },
                    });
                }
            }

            this.lastCheckDate = new Date();
            logger.info('Payment check completed', { paymentsChecked: activePayments.length });
        } catch (error) {
            logger.error('Payment monitor check failed', error);
        }
    }

    /**
     * Calculate days until payment is due
     */
    getDaysUntilDue(payment: RecurringPayment): number {
        const today = new Date();
        const nextDueDate = this.getNextDueDate(payment);

        // Calculate difference in days
        const diffTime = nextDueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays;
    }

    /**
     * Get the next due date for a recurring payment
     */
    private getNextDueDate(payment: RecurringPayment): Date {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();

        if (payment.frequency === 'monthly') {
            // Calculate next monthly due date
            let dueMonth = currentMonth;
            let dueYear = currentYear;

            // If we've passed the due day this month, move to next month
            if (currentDay > payment.dueDay) {
                dueMonth++;
                if (dueMonth > 11) {
                    dueMonth = 0;
                    dueYear++;
                }
            }

            // Handle edge case: dueDay doesn't exist in target month (e.g., Feb 31)
            const daysInMonth = new Date(dueYear, dueMonth + 1, 0).getDate();
            const actualDueDay = Math.min(payment.dueDay, daysInMonth);

            return new Date(dueYear, dueMonth, actualDueDay);
        } else {
            // Yearly frequency
            let dueYear = currentYear;

            // If we've passed the due day this year, move to next year
            const thisYearDueDate = new Date(currentYear, 0, payment.dueDay);
            if (today > thisYearDueDate) {
                dueYear++;
            }

            return new Date(dueYear, 0, payment.dueDay);
        }
    }

    /**
     * Check if payment has already been paid for the current period
     */
    isAlreadyPaid(payment: RecurringPayment): boolean {
        if (!payment.id) return false;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Find transactions linked to this recurring payment in the current period
        const linkedTransactions = this.deps.transactions.filter((t) => {
            const tDate = new Date(t.date);
            const isCurrentPeriod =
                payment.frequency === 'monthly'
                    ? tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear
                    : tDate.getFullYear() === currentYear;

            return (
                t.recurringPaymentId === payment.id &&
                t.paid &&
                isCurrentPeriod
            );
        });

        return linkedTransactions.length > 0;
    }

    /**
     * Reset last check date (useful for testing)
     */
    resetLastCheck(): void {
        this.lastCheckDate = null;
    }
}
