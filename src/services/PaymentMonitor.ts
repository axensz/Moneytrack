/**
 * PaymentMonitor - Monitors recurring payment due dates and generates reminders
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 14.2, 14.5
 */

import { logger } from '../utils/logger';
import { formatCurrency } from '../utils/formatters';
import { getNextDueDate, getCycleWindow } from '../utils/recurringDates';
import type { RecurringPayment, Transaction, Notification } from '../types/finance';

interface PaymentMonitorDeps {
    createNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => Promise<void>;
    recurringPayments: RecurringPayment[];
    transactions: Transaction[];
}

export class PaymentMonitor {
    public deps: PaymentMonitorDeps;
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
        // Util compartido con la vista: fin de mes (clamp) + anual anclado en createdAt.
        const nextDueDate = getNextDueDate(payment);

        // Calculate difference in days
        const diffTime = nextDueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays;
    }

    /**
     * Check if payment has already been paid for the current billing cycle.
     *
     * Usa la ventana de ciclo [inicio, fin) del util compartido (en paridad con
     * la vista): cuenta como pagado si alguna transacción del pago, con paid===true,
     * cae dentro de la ventana del ciclo actual. Así un pago anticipado o atrasado
     * cuenta para el ciclo correcto (no por mes calendario).
     */
    isAlreadyPaid(payment: RecurringPayment): boolean {
        if (!payment.id) return false;

        const { start, end } = getCycleWindow(payment);
        const startMs = start.getTime();
        const endMs = end.getTime();

        return this.deps.transactions.some((t) => {
            if (t.recurringPaymentId !== payment.id || !t.paid) return false;
            const tMs = new Date(t.date).getTime();
            return tMs >= startMs && tMs < endMs;
        });
    }

    /**
     * Reset last check date (useful for testing)
     */
    resetLastCheck(): void {
        this.lastCheckDate = null;
    }
}
