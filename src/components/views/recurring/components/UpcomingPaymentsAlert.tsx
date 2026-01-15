'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { RecurringPayment } from '../../../../types/finance';

interface UpcomingPaymentsAlertProps {
  upcomingPayments: RecurringPayment[];
  getDaysUntilDue: (payment: RecurringPayment) => number;
  formatCurrency: (amount: number) => string;
}

/**
 * Alerta de pagos próximos a vencer (dentro de 3 días)
 */
export const UpcomingPaymentsAlert: React.FC<UpcomingPaymentsAlertProps> = ({
  upcomingPayments,
  getDaysUntilDue,
  formatCurrency,
}) => {
  if (upcomingPayments.length === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
        <h3 className="font-semibold text-amber-800 dark:text-amber-200">
          Pagos próximos a vencer
        </h3>
      </div>
      <div className="space-y-2">
        {upcomingPayments.map((payment) => (
          <div
            key={payment.id}
            className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3"
          >
            <div>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {payment.name}
              </span>
              <span className="ml-2 text-sm text-gray-500">
                vence en {getDaysUntilDue(payment)} días
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
