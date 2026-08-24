import React from 'react';
import { AlertTriangle, Ban, CalendarClock, DollarSign, Trash2, WalletCards, X } from 'lucide-react';
import { ACTION_ICONS } from '../../../../config/ui';
import { ensureDate } from '../../../../utils/dateUtils';
import { getDebtNextPaymentInfo } from '../../../../utils/debtPaymentSchedule';
import { formatDate, formatNumberForInput, formatRelativeTime, unformatNumber } from '../../../../utils/formatters';
import type { Debt } from '../../../../types/finance';
import { FORGIVEN_LABELS } from '../constants';
import { PaymentScheduleFields } from './PaymentScheduleFields';
import type { PaymentScheduleFormState } from '../utils/paymentScheduleForm';

const EditIcon = ACTION_ICONS.edit;

export interface DebtCardProps {
  debt: Debt;
  formatCurrency: (n: number) => string;
  showPaymentForm: string | null;
  setShowPaymentForm: (id: string | null) => void;
  paymentAmount: string;
  setPaymentAmount: (v: string) => void;
  onPayment: (id: string) => void;
  onDelete: (debt: Debt) => void;
  onChangeAccount: (debt: Debt) => void;
  showBalanceModifier: string | null;
  setShowBalanceModifier: (id: string | null) => void;
  modifierAmount: string;
  setModifierAmount: (v: string) => void;
  modifierOperation: 'add' | 'subtract';
  setModifierOperation: (op: 'add' | 'subtract') => void;
  onModifyBalance: (id: string, operation: 'add' | 'subtract') => void;
  onForgive: (id: string, reason: NonNullable<Debt['forgivenReason']>) => void;
  showForgive: string | null;
  setShowForgive: (id: string | null) => void;
  showPaymentScheduleForm: string | null;
  paymentScheduleForm: PaymentScheduleFormState;
  setPaymentScheduleForm: React.Dispatch<React.SetStateAction<PaymentScheduleFormState>>;
  onOpenPaymentSchedule: (debt: Debt) => void;
  onSavePaymentSchedule: (id: string) => void;
  setShowPaymentScheduleForm: (id: string | null) => void;
}

export const DebtCard: React.FC<DebtCardProps> = React.memo(({
  debt,
  formatCurrency,
  showPaymentForm,
  setShowPaymentForm,
  paymentAmount,
  setPaymentAmount,
  onPayment,
  onDelete,
  onChangeAccount,
  showBalanceModifier,
  setShowBalanceModifier,
  modifierAmount,
  setModifierAmount,
  modifierOperation,
  setModifierOperation,
  onModifyBalance,
  onForgive,
  showForgive,
  setShowForgive,
  showPaymentScheduleForm,
  paymentScheduleForm,
  setPaymentScheduleForm,
  onOpenPaymentSchedule,
  onSavePaymentSchedule,
  setShowPaymentScheduleForm,
}) => {
  const progress = debt.originalAmount > 0
    ? Math.round(((debt.originalAmount - debt.remainingAmount) / debt.originalAmount) * 100)
    : 0;

  const isLent = debt.type === 'lent';

  // Antigüedad y vencimiento
  const lentSource = debt.lentDate ?? debt.createdAt;
  const lentLabel = lentSource ? formatRelativeTime(ensureDate(lentSource)) : null;
  const dueDate = debt.dueDate ? ensureDate(debt.dueDate) : null;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const isDebtOverdue = !!dueDate && !debt.isSettled && dueDate < todayStart;
  const paymentInfo = getDebtNextPaymentInfo(debt, todayStart);
  const isPaymentOverdue = Boolean(paymentInfo?.isOverdue);
  const paymentLabel = paymentInfo
    ? paymentInfo.isOverdue
      ? `Pago esperado ${formatRelativeTime(paymentInfo.date)}`
      : `Próximo pago ${paymentInfo.source === 'monthly' ? 'aprox. ' : ''}${formatDate(paymentInfo.date)}`
    : null;

  return (
    <div className={`border rounded-xl p-3 bg-white dark:bg-gray-800 ${isDebtOverdue || isPaymentOverdue ? 'border-rose-300 dark:border-rose-800' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-0">
        <div className="flex-1 min-w-0">
          <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {debt.personName}
            </span>
            {debt.description && (
              <span className="max-w-full truncate text-xs text-gray-500 dark:text-gray-400">
                — {debt.description}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {formatCurrency(debt.remainingAmount)}
            </span>
            {debt.remainingAmount !== debt.originalAmount && (
              <span className="text-xs text-muted-foreground line-through">
                {formatCurrency(debt.originalAmount)}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {progress > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{progress}% pagado</span>
                <span>Faltan {formatCurrency(debt.remainingAmount)}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Antigüedad y vencimiento */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
            {lentLabel && (
              <span className="text-muted-foreground">
                {isLent ? 'Prestado' : 'Recibido'} {lentLabel}
              </span>
            )}
            {dueDate && (
              isDebtOverdue ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">
                  <AlertTriangle size={11} />
                  Vencido {formatRelativeTime(dueDate)}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Vence el {formatDate(dueDate)}
                </span>
              )
            )}
            {paymentInfo && paymentLabel && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium ${isPaymentOverdue
                ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                : 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
              }`}>
                {isPaymentOverdue ? <AlertTriangle size={11} /> : <CalendarClock size={11} />}
                {paymentLabel}
              </span>
            )}
            {paymentInfo?.isOneTimeOverride && paymentInfo.expectedPaymentDay && (
              <span className="text-muted-foreground">
                Luego vuelve al día {paymentInfo.expectedPaymentDay}
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-1 border-t border-gray-100 pt-2 dark:border-gray-700 sm:ml-2 sm:w-auto sm:border-t-0 sm:pt-0">
          <button
            onClick={() => onOpenPaymentSchedule(debt)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sky-600 dark:text-sky-400 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-sky-900/30"
            aria-label={`Próximo pago de ${debt.personName}`}
            title="Próximo pago"
          >
            <CalendarClock size={16} />
          </button>
          <button
            onClick={() => onChangeAccount(debt)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-primary hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-purple-900/30"
            aria-label={`Cambiar cuenta de ${debt.personName}`}
            title="Cambiar cuenta"
          >
            <WalletCards size={16} />
          </button>
          <button
            onClick={() => {
              if (showBalanceModifier === debt.id) {
                setShowBalanceModifier(null);
              } else {
                setShowBalanceModifier(debt.id!);
                setModifierAmount('');
                setModifierOperation('add');
                setShowPaymentScheduleForm(null);
              }
            }}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-purple-600 dark:text-purple-400 hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-purple-900/30"
            aria-label={`Modificar saldo de ${debt.personName}`}
            title="Modificar saldo"
          >
            <EditIcon size={16} />
          </button>
          <button
            onClick={() => {
              if (showPaymentForm === debt.id) {
                setShowPaymentForm(null);
              } else {
                setShowPaymentForm(debt.id!);
                setPaymentAmount('');
                setShowPaymentScheduleForm(null);
              }
            }}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-green-600 dark:text-green-400 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-green-900/30"
            aria-label={`Registrar pago de ${debt.personName}`}
            title="Registrar pago"
          >
            <DollarSign size={16} />
          </button>
          <button
            onClick={() => setShowForgive(showForgive === debt.id ? null : debt.id!)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-amber-900/30"
            aria-label={`Condonar deuda de ${debt.personName}`}
            title="Condonar"
          >
            <Ban size={16} />
          </button>
          <button
            onClick={() => onDelete(debt)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-destructive-muted text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Eliminar ${debt.type === 'lent' ? 'préstamo' : 'deuda'} de ${debt.personName}`}
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Payment schedule form */}
      {showPaymentScheduleForm === debt.id && (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Próximo pago
            </span>
            <button
              onClick={() => setShowPaymentScheduleForm(null)}
              className="p-1 text-muted-foreground hover:text-foreground"
              title="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
          <PaymentScheduleFields
            value={paymentScheduleForm}
            onChange={setPaymentScheduleForm}
          />
          <button
            onClick={() => onSavePaymentSchedule(debt.id!)}
            className="btn-submit w-full text-sm"
          >
            Guardar fecha
          </button>
        </div>
      )}

      {/* Payment form */}
      {showPaymentForm === debt.id && (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={formatNumberForInput(paymentAmount)}
            onChange={e => setPaymentAmount(unformatNumber(e.target.value))}
            placeholder="Monto del pago"
            className="input-base min-w-0 text-sm"
            autoFocus
          />
          <button
            onClick={() => onPayment(debt.id!)}
            className="btn-submit text-sm px-3"
          >
            Pagar
          </button>
          <button
            onClick={() => setShowPaymentForm(null)}
            className="p-2 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Balance modifier form */}
      {showBalanceModifier === debt.id && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setModifierOperation('add')}
              className={`btn-type ${modifierOperation === 'add'
                ? 'btn-type-active-success'
                : 'btn-type-inactive'
                }`}
            >
              Agregar
            </button>
            <button
              onClick={() => setModifierOperation('subtract')}
              className={`btn-type ${modifierOperation === 'subtract'
                ? 'btn-type-active-destructive'
                : 'btn-type-inactive'
                }`}
            >
              Restar
            </button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={formatNumberForInput(modifierAmount)}
              onChange={e => setModifierAmount(unformatNumber(e.target.value))}
              placeholder="Monto"
              className="input-base min-w-0 text-sm"
              autoFocus
            />
            <button
              onClick={() => onModifyBalance(debt.id!, modifierOperation)}
              className="btn-submit text-sm px-3"
            >
              Aplicar
            </button>
            <button
              onClick={() => setShowBalanceModifier(null)}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Condonar: elige motivo. Marca la deuda saldada con motivo, sin mover dinero. */}
      {showForgive === debt.id && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Condonar deuda — el saldo pendiente se da por cerrado. Elige el motivo:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {(['unpaid', 'gift', 'other'] as const).map((reason) => (
              <button
                key={reason}
                onClick={() => onForgive(debt.id!, reason)}
                className="flex-1 min-w-[88px] py-2 px-3 rounded-lg text-sm font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
              >
                {FORGIVEN_LABELS[reason]}
              </button>
            ))}
            <button
              onClick={() => setShowForgive(null)}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

DebtCard.displayName = 'DebtCard';
