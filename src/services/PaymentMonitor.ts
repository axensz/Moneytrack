import { logger } from '../utils/logger';
import { formatCurrency } from '../utils/formatters';
import { calendarDayDifference, cycleKey, getScheduledDueDate } from '../utils/recurringDates';
import { recurringTransactionSatisfiesCycleKey } from '../utils/recurringPayments';
import {
  evaluateRecurringReminderCursor,
  type RecurringReminderCursor,
} from '../utils/recurringReminderCursor';
import type { RecurringReminderCursorStore } from '../lib/recurringReminderCursorStore';
import type { Notification, RecurringPayment, Transaction } from '../types/finance';
import { viewActionUrl } from '../hooks/useViewRouting';

interface PaymentMonitorDeps {
  createNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => Promise<void>;
  recurringPayments: RecurringPayment[];
  transactions: Transaction[];
  cursorStore?: RecurringReminderCursorStore;
  timeZone?: string;
  writerPrefix?: string;
  authorityConfigVersion?: number;
}

const emptyCursorStore: RecurringReminderCursorStore = { read: () => undefined };

const candidateCopy = (
  payment: RecurringPayment,
  cursor: RecurringReminderCursor,
): Pick<Notification, 'title' | 'message' | 'severity' | 'stage' | 'stageWindow' | 'overdueOccurrence'> => {
  if (cursor.stageWindow === 'd3') return {
    title: `Recordatorio: ${payment.name}`,
    message: `El pago de ${formatCurrency(payment.amount)} vence en 3 días`,
    severity: 'info', stage: 'd3', stageWindow: 'd3',
  };
  if (cursor.stageWindow === 'd1') return {
    title: `Pago vence mañana: ${payment.name}`,
    message: `El pago de ${formatCurrency(payment.amount)} vence mañana`,
    severity: 'warning', stage: 'd1', stageWindow: 'd1',
  };
  if (cursor.stageWindow === 'due') return {
    title: `Pago vence hoy: ${payment.name}`,
    message: `El pago de ${formatCurrency(payment.amount)} vence hoy`,
    severity: 'warning', stage: 'due', stageWindow: 'due',
  };
  const occurrence = Number(/^overdue:(\d+)$/.exec(cursor.stageWindow ?? '')?.[1]);
  const overdueDays = 1 + 7 * occurrence;
  return {
    title: `Pago vencido: ${payment.name}`,
    message: `El pago de ${formatCurrency(payment.amount)} venció hace ${overdueDays} ${overdueDays === 1 ? 'día' : 'días'}`,
    severity: 'error', stage: 'overdue', stageWindow: `overdue:${occurrence}`,
    overdueOccurrence: occurrence,
  };
};

export const buildRecurringReminderCandidate = ({
  payment,
  cursor,
  writerPrefix,
  authorityConfigVersion,
}: {
  payment: RecurringPayment;
  cursor: RecurringReminderCursor;
  writerPrefix: string;
  authorityConfigVersion?: number;
}): Omit<Notification, 'id' | 'createdAt'> => ({
  type: 'recurring',
  ...candidateCopy(payment, cursor),
  schemaVersion: 2,
  eventKey: `${writerPrefix}:recurring:${encodeURIComponent(payment.id!)}:${cursor.cycleKey}`,
  lifecycleStatus: 'active',
  isRead: false,
  actionUrl: viewActionUrl('recurring'),
  metadata: {
    recurringPaymentId: payment.id!,
    amount: payment.amount,
    recurringCycle: cursor.cycleKey,
    localDate: cursor.dueLocalDate,
  },
  ...(authorityConfigVersion === undefined ? {} : { authorityConfigVersion }),
});

export class PaymentMonitor {
  public deps: PaymentMonitorDeps;
  private lastCheckState: string | null = null;

  constructor(deps: PaymentMonitorDeps) {
    this.deps = deps;
  }

  async checkUpcomingPayments(): Promise<void> {
    try {
      const now = new Date();
      const timeZone = this.deps.timeZone
        ?? Intl.DateTimeFormat().resolvedOptions().timeZone
        ?? 'America/Bogota';
      const cursorStore = this.deps.cursorStore ?? emptyCursorStore;
      const writerPrefix = this.deps.writerPrefix ?? 'foreground:compat';
      const evaluations = this.deps.recurringPayments
        .filter((payment) => payment.isActive && payment.id)
        .map((payment) => ({
          payment,
          evaluation: evaluateRecurringReminderCursor({
            payment,
            now,
            timeZone,
            cursor: cursorStore.read(payment.id!),
            isPaid: (targetCycle) => this.isAlreadyPaid(payment, targetCycle),
          }),
        }));
      const currentState = JSON.stringify(evaluations.map(({ payment, evaluation }) => [
        payment.id,
        evaluation.nextCursor.cycleKey,
        evaluation.activeStageWindow,
        evaluation.resolvedCycleKey,
      ]));
      if (this.lastCheckState === currentState) return;

      for (const { payment, evaluation } of evaluations) {
        const paymentId = payment.id!;
        if (!evaluation.activeStageWindow) {
          if (evaluation.resolvedCycleKey) cursorStore.removeGuest?.(paymentId);
          continue;
        }
        const cursor = evaluation.nextCursor;
        await this.deps.createNotification(buildRecurringReminderCandidate({
          payment, cursor, writerPrefix,
          authorityConfigVersion: this.deps.authorityConfigVersion,
        }));
        cursorStore.persistGuest?.(paymentId, cursor);
      }

      this.lastCheckState = currentState;
      logger.info('Payment check completed', { paymentsChecked: evaluations.length });
    } catch (error) {
      logger.error('Payment monitor check failed', error);
    }
  }

  /** Kept for callers that display the legacy calendar-day distance. */
  getDaysUntilDue(payment: RecurringPayment): number {
    const today = new Date();
    return calendarDayDifference(today, getScheduledDueDate(payment, today));
  }

  isAlreadyPaid(payment: RecurringPayment, targetCycle = cycleKey(payment, new Date())): boolean {
    if (!payment.id) return false;
    const timeZone = this.deps.timeZone
      ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      ?? 'America/Bogota';
    return this.deps.transactions.some((transaction) =>
      recurringTransactionSatisfiesCycleKey(payment, transaction, targetCycle, timeZone));
  }

  resetLastCheck(): void {
    this.lastCheckState = null;
  }
}
