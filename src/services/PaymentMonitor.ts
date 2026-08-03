/**
 * PaymentMonitor - Monitors recurring payment due dates and generates reminders
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 14.2, 14.5
 */

import { logger } from '../utils/logger';
import { formatCurrency } from '../utils/formatters';
import { calendarDayDifference, getScheduledDueDate, getCycleWindow, cycleKey } from '../utils/recurringDates';
import type { RecurringPayment, Transaction, Notification } from '../types/finance';
import { viewActionUrl } from '../hooks/useViewRouting';

interface PaymentMonitorDeps {
    createNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => Promise<void>;
    recurringPayments: RecurringPayment[];
    transactions: Transaction[];
}

export class PaymentMonitor {
    public deps: PaymentMonitorDeps;
    private lastCheckDate: Date | null = null;
    private lastCheckState: string | null = null;

    constructor(deps: PaymentMonitorDeps) {
        this.deps = deps;
    }

    /**
     * Check for upcoming payments and generate reminders
     * Should be called daily on app initialization
     */
    async checkUpcomingPayments(): Promise<void> {
        try {
            const currentState = this.getCurrentState();
            // Only run once per day
            if (this.lastCheckDate) {
                const today = new Date();
                const lastCheck = this.lastCheckDate;
                if (
                    today.getDate() === lastCheck.getDate() &&
                    today.getMonth() === lastCheck.getMonth() &&
                    today.getFullYear() === lastCheck.getFullYear() &&
                    this.lastCheckState === currentState
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

                // Cadencia aprobada: D-3, D-1, D0 y D+1/D+8/D+15.
                if (daysUntilDue === 0) {
                    // Due today
                    await this.deps.createNotification({
                        type: 'recurring',
                        title: `Pago vence hoy: ${payment.name}`,
                        message: `El pago de ${formatCurrency(payment.amount)} vence hoy`,
                        severity: 'warning',
                        isRead: false,
                        actionUrl: viewActionUrl('recurring'),
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
                        actionUrl: viewActionUrl('recurring'),
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
                        actionUrl: viewActionUrl('recurring'),
                        metadata: {
                            recurringPaymentId: payment.id,
                            amount: payment.amount,
                        },
                    });
                } else if ([-1, -8, -15].includes(daysUntilDue)) {
                    const overdueDays = Math.abs(daysUntilDue);
                    await this.deps.createNotification({
                        type: 'recurring',
                        title: `Pago vencido: ${payment.name}`,
                        message: `El pago de ${formatCurrency(payment.amount)} venció hace ${overdueDays} ${overdueDays === 1 ? 'día' : 'días'}`,
                        severity: 'error',
                        isRead: false,
                        actionUrl: viewActionUrl('recurring'),
                        metadata: {
                            recurringPaymentId: payment.id,
                            amount: payment.amount,
                        },
                    });
                }
            }

            this.lastCheckDate = new Date();
            this.lastCheckState = currentState;
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
        return calendarDayDifference(today, getScheduledDueDate(payment, today));
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

        const targetKey = cycleKey(payment);
        const { start, end } = getCycleWindow(payment);
        const startMs = start.getTime();
        const endMs = end.getTime();

        return this.deps.transactions.some((t) => {
            if (t.recurringPaymentId !== payment.id || !t.paid) return false;
            // Estampa explícita manda sobre la fecha (paridad con la vista).
            if (t.recurringCycle) return t.recurringCycle === targetKey;
            const tMs = new Date(t.date).getTime();
            return tMs >= startMs && tMs < endMs;
        });
    }

    /** Solo los datos que cambian el estado de un recordatorio reabren el guard diario. */
    private getCurrentState(): string {
        return JSON.stringify({
            payments: this.deps.recurringPayments.map(({ id, dueDay, frequency, isActive, createdAt }) => [
                id, dueDay, frequency, isActive, createdAt ? new Date(createdAt).getTime() : null,
            ]),
            transactions: this.deps.transactions
                .filter((t) => t.recurringPaymentId)
                .map(({ id, recurringPaymentId, recurringCycle, paid, date }) => [
                    id, recurringPaymentId, recurringCycle, paid, new Date(date).getTime(),
                ]),
        });
    }

    /**
     * Reset last check date (useful for testing)
     */
    resetLastCheck(): void {
        this.lastCheckDate = null;
        this.lastCheckState = null;
    }
}
