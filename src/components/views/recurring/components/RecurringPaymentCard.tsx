'use client';

import React, { useState } from 'react';
import {
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CalendarDays,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { RecurringPayment, Account, Transaction } from '../../../../types/finance';

interface RecurringPaymentCardProps {
  payment: RecurringPayment;
  isPaid: boolean;
  daysUntilDue: number;
  nextDueDate: Date;
  account?: Account;
  history: Transaction[];
  formatCurrency: (amount: number) => string;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Card individual de pago periódico
 * Muestra estado, próximo vencimiento e historial expandible
 */
export const RecurringPaymentCard: React.FC<RecurringPaymentCardProps> = ({
  payment,
  isPaid,
  daysUntilDue,
  nextDueDate,
  account,
  history,
  formatCurrency,
  onEdit,
  onDelete,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getCardClasses = () => {
    const base = 'border rounded-xl overflow-hidden transition-all';

    if (isPaid) {
      return `${base} border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10`;
    }

    if (daysUntilDue <= 3) {
      return `${base} border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10`;
    }

    return `${base} border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800`;
  };

  const getStatusIcon = () => {
    if (isPaid) {
      return (
        <CheckCircle2
          size={18}
          className="text-emerald-600 dark:text-emerald-400 flex-shrink-0"
        />
      );
    }

    if (daysUntilDue <= 3) {
      return (
        <AlertTriangle
          size={18}
          className="text-amber-600 dark:text-amber-400 flex-shrink-0"
        />
      );
    }

    return <Clock size={18} className="text-gray-400 flex-shrink-0" />;
  };

  const getDueText = () => {
    if (daysUntilDue === 0) return '(Hoy)';
    if (daysUntilDue === 1) return '(Mañana)';
    return `(en ${daysUntilDue} días)`;
  };

  return (
    <div className={getCardClasses()}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {getStatusIcon()}
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                {payment.name}
              </h4>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {payment.category}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <CalendarDays size={14} />
                Día {payment.dueDay} •{' '}
                {payment.frequency === 'monthly' ? 'Mensual' : 'Anual'}
              </span>
              {account && <span>{account.name}</span>}
            </div>

            {!isPaid && (
              <p className="text-sm mt-2">
                <span
                  className={
                    daysUntilDue <= 3
                      ? 'text-amber-600 dark:text-amber-400 font-medium'
                      : 'text-gray-500'
                  }
                >
                  Próximo:{' '}
                  {nextDueDate.toLocaleDateString('es-CO', {
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  {getDueText()}
                </span>
              </p>
            )}
          </div>

          {/* Amount */}
          <div className="text-right flex-shrink-0">
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {formatCurrency(payment.amount)}
            </p>
            {isPaid && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ Pagado este mes
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 flex items-center gap-1"
          >
            <History size={14} />
            Historial
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
              title="Editar"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
              title="Eliminar"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded history */}
      {isExpanded && (
        <PaymentHistory history={history} formatCurrency={formatCurrency} />
      )}
    </div>
  );
};

// Sub-componente para historial
interface PaymentHistoryProps {
  history: Transaction[];
  formatCurrency: (amount: number) => string;
}

const PaymentHistory: React.FC<PaymentHistoryProps> = ({
  history,
  formatCurrency,
}) => {
  return (
    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 my-3">
        Últimos pagos
      </h5>
      {history.length === 0 ? (
        <p className="text-sm text-gray-400">Sin historial de pagos</p>
      ) : (
        <div className="space-y-2">
          {history.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between text-sm bg-white dark:bg-gray-800 rounded-lg p-2"
            >
              <span className="text-gray-600 dark:text-gray-400">
                {new Date(t.date).toLocaleDateString('es-CO', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {formatCurrency(t.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
