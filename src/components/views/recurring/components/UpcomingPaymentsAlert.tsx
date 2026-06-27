'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { RecurringPayment } from '../../../../types/finance';

type AlertTone = 'warning' | 'destructive';

interface PaymentsAlertProps {
  payments: RecurringPayment[];
  title: string;
  getLabel: (payment: RecurringPayment) => string;
  formatCurrency: (amount: number) => string;
  tone?: AlertTone;
}

const TONE_STYLES: Record<AlertTone, { container: string; icon: string; title: string }> = {
  warning: {
    container: 'bg-warning-muted border-warning',
    icon: 'text-warning',
    title: 'text-warning',
  },
  destructive: {
    container: 'bg-destructive-muted border-destructive',
    icon: 'text-destructive',
    title: 'text-destructive',
  },
};

/**
 * Alerta de pagos próximos a vencer (warning) o vencidos (destructive).
 */
export const UpcomingPaymentsAlert: React.FC<PaymentsAlertProps> = ({
  payments,
  title,
  getLabel,
  formatCurrency,
  tone = 'warning',
}) => {
  if (payments.length === 0) return null;

  const styles = TONE_STYLES[tone];

  return (
    <div className={`border rounded-xl p-4 ${styles.container}`}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={20} className={styles.icon} />
        <h3 className={`font-semibold ${styles.title}`}>
          {title} ({payments.length})
        </h3>
      </div>
      <div className="space-y-2">
        {payments.map((payment) => (
          <div
            key={payment.id}
            className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3"
          >
            <div>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {payment.name}
              </span>
              <span className="ml-2 text-sm text-gray-500">
                {getLabel(payment)}
              </span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(payment.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
