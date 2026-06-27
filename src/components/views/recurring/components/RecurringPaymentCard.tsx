'use client';

import React, { useState, memo } from 'react';
import {
  Edit2,
  Trash2,
  CheckCircle2,
  Check,
  Clock,
  AlertTriangle,
  CalendarDays,
  History,
  ChevronDown,
  ChevronUp,
  Zap,
  Wifi,
  Home,
  ShoppingCart,
  Smartphone,
  Car,
  Heart,
  GraduationCap,
  Coffee,
  Film,
} from 'lucide-react';
import type { RecurringPayment, Account, Transaction } from '../../../../types/finance';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { isLastDayOfMonth } from '../../../../utils/recurringDates';

// Mapeo de categorías a iconos mejorados
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Servicios': Zap,
  'Internet': Wifi,
  'Arriendo': Home,
  'Supermercado': ShoppingCart,
  'Telefonía': Smartphone,
  'Transporte': Car,
  'Salud': Heart,
  'Educación': GraduationCap,
  'Entretenimiento': Film,
  'Suscripciones': Coffee,
};

interface RecurringPaymentCardProps {
  payment: RecurringPayment;
  isPaid: boolean;
  daysUntilDue: number;
  daysOverdue: number;
  nextDueDate: Date;
  account?: Account;
  history: Transaction[];
  formatCurrency: (amount: number) => string;
  onEdit: () => void;
  onDelete: () => void;
  onMarkPaid: () => void;
  onDeletePayment: (transaction: Transaction) => void;
}

/**
 * Card individual de pago periódico
 * Muestra estado, próximo vencimiento e historial expandible
 */
export const RecurringPaymentCard: React.FC<RecurringPaymentCardProps> = memo(({
  payment,
  isPaid,
  daysUntilDue,
  daysOverdue,
  nextDueDate,
  account,
  history,
  formatCurrency,
  onEdit,
  onDelete,
  onMarkPaid,
  onDeletePayment,
}) => {
  const { hideBalances } = useUIPreferences();
  const [isExpanded, setIsExpanded] = useState(false);

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);
  const isPaymentOverdue = !isPaid && daysOverdue > 0;

  // Obtener icono según categoría
  const CategoryIcon = CATEGORY_ICONS[payment.category] || CalendarDays;

  const getCardClasses = () => {
    const base = 'border rounded-xl overflow-hidden transition-colors';

    if (isPaid) {
      return `${base} border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10`;
    }

    if (isPaymentOverdue) {
      return `${base} border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-900/10`;
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

    if (isPaymentOverdue) {
      return (
        <AlertTriangle
          size={18}
          className="text-rose-600 dark:text-rose-400 flex-shrink-0"
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

    return <Clock size={18} className="text-muted-foreground flex-shrink-0" />;
  };

  const getDueText = () => {
    if (daysUntilDue === 0) return '(Hoy)';
    if (daysUntilDue === 1) return '(Mañana)';
    return `(en ${daysUntilDue} días)`;
  };

  // Distintivo textual para "próximo a vencer": no depender solo del color ámbar.
  const isSoon = !isPaid && !isPaymentOverdue && daysUntilDue <= 3;
  const soonChipText =
    daysUntilDue <= 0 ? 'Vence hoy' : daysUntilDue === 1 ? 'Vence mañana' : `Vence en ${daysUntilDue} días`;

  // Día de vencimiento legible (centinela "último día" → texto explícito).
  const dueDayLabel = isLastDayOfMonth(payment.dueDay) ? 'Último día' : `Día ${payment.dueDay}`;

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
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                <CategoryIcon size={12} />
                {payment.category}
              </span>
              {isSoon && (
                <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-warning-muted text-warning">
                  <Clock size={12} />
                  {soonChipText}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays size={14} />
                {dueDayLabel} •{' '}
                {payment.frequency === 'monthly' ? 'Mensual' : 'Anual'}
              </span>
              {account && <span>{account.name}</span>}
            </div>

            {!isPaid && (
              <p className="text-sm mt-2">
                {isPaymentOverdue ? (
                  <span className="text-destructive font-semibold">
                    Venció hace {daysOverdue} {daysOverdue === 1 ? 'día' : 'días'} · {dueDayLabel.toLowerCase()}
                  </span>
                ) : (
                  <span
                    className={
                      daysUntilDue <= 3
                        ? 'text-warning font-medium'
                        : 'text-muted-foreground'
                    }
                  >
                    Próximo:{' '}
                    {nextDueDate.toLocaleDateString('es-CO', {
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    {getDueText()}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Amount */}
          <div className="text-right flex-shrink-0">
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {displayAmount(payment.amount)}
            </p>
            {isPaid && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <Check size={12} className="flex-shrink-0" />
                Pagado este mes
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-primary/10 transition-colors min-h-[36px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <History size={14} />
            Historial
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <div className="flex gap-2">
            {!isPaid && (
              <button
                onClick={onMarkPaid}
                className="flex items-center gap-1.5 px-3 min-h-[36px] text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-colors"
                title="Marcar como pagado"
              >
                <Check size={16} />
                Ya pagó
              </button>
            )}
            <button
              onClick={onEdit}
              className="flex items-center justify-center p-2 min-h-[36px] min-w-[36px] text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              title="Editar"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={onDelete}
              className="flex items-center justify-center p-2 min-h-[36px] min-w-[36px] text-muted-foreground hover:text-destructive hover:bg-destructive-muted rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
              title="Eliminar"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded history */}
      {isExpanded && (
        <PaymentHistory history={history} formatCurrency={formatCurrency} onDeletePayment={onDeletePayment} />
      )}
    </div>
  );
});

RecurringPaymentCard.displayName = 'RecurringPaymentCard';

// Sub-componente para historial
interface PaymentHistoryProps {
  history: Transaction[];
  formatCurrency: (amount: number) => string;
  onDeletePayment: (transaction: Transaction) => void;
}

const PaymentHistory: React.FC<PaymentHistoryProps> = memo(({
  history,
  formatCurrency,
  onDeletePayment,
}) => {
  const { hideBalances } = useUIPreferences();
  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  return (
    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 my-3">
        Últimos pagos
      </h5>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin historial de pagos</p>
      ) : (
        <div className="space-y-2">
          {history.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-2 text-sm bg-white dark:bg-gray-800 rounded-lg p-2"
            >
              <span className="text-muted-foreground">
                {new Date(t.date).toLocaleDateString('es-CO', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {displayAmount(t.amount)}
                </span>
                <button
                  onClick={() => onDeletePayment(t)}
                  className="flex items-center justify-center p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive-muted rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                  title="Eliminar este pago"
                  aria-label="Eliminar este pago"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

PaymentHistory.displayName = 'PaymentHistory';
