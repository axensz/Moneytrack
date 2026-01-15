'use client';

import React from 'react';
import type { RecurringPayment } from '../../../../types/finance';

interface InactivePaymentsListProps {
  payments: RecurringPayment[];
  formatCurrency: (amount: number) => string;
  onReactivate: (payment: RecurringPayment) => void;
}

/**
 * Lista de pagos periódicos pausados
 */
export const InactivePaymentsList: React.FC<InactivePaymentsListProps> = ({
  payments,
  formatCurrency,
  onReactivate,
}) => {
  if (payments.length === 0) return null;

  return (
    <div className="card opacity-60">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
        Pagos Pausados ({payments.length})
      </h3>
      <div className="space-y-2">
        {payments.map((payment) => (
          <div
            key={payment.id}
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <div>
              <span className="font-medium text-gray-600 dark:text-gray-400">
                {payment.name}
              </span>
              <span className="ml-2 text-sm text-gray-400">
                {formatCurrency(payment.amount)}
              </span>
            </div>
            <button
              onClick={() => onReactivate(payment)}
              className="text-sm text-purple-600 hover:underline"
            >
              Reactivar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
