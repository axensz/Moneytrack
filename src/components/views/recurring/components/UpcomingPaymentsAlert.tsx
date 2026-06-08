'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { RecurringPayment } from '../../../../types/finance';

type AlertTone = 'amber' | 'red';

interface PaymentsAlertProps {
  payments: RecurringPayment[];
  title: string;
  getLabel: (payment: RecurringPayment) => string;
  formatCurrency: (amount: number) => string;
  tone?: AlertTone;
}

const TONE_STYLES: Record<AlertTone, { container: string; icon: string; title: string }> = {
  amber: {
    container: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    icon: 'text-amber-600 dark:text-amber-400',
    title: 'text-amber-800 dark:text-amber-200',
  },
  red: {
    container: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',
    icon: 'text-rose-600 dark:text-rose-400',
    title: 'text-rose-800 dark:text-rose-200',
  },
};

/**
 * Alerta de pagos próximos a vencer (ámbar) o vencidos (rojo).
 */
export const UpcomingPaymentsAlert: React.FC<PaymentsAlertProps> = ({
  payments,
  title,
  getLabel,
  formatCurrency,
  tone = 'amber',
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
