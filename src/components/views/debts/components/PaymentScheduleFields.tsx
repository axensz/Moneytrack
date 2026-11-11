import React from 'react';
import { formatNumberForInput, unformatNumber } from '../../../../utils/formatters';
import { PAYMENT_SCHEDULE_MODES, type PaymentScheduleFormState } from '../utils/paymentScheduleForm';

interface PaymentScheduleFieldsProps {
  value: PaymentScheduleFormState;
  onChange: React.Dispatch<React.SetStateAction<PaymentScheduleFormState>>;
}

export const PaymentScheduleFields: React.FC<PaymentScheduleFieldsProps> = ({ value, onChange }) => {
  const setField = (updates: Partial<PaymentScheduleFormState>) => {
    onChange(prev => ({ ...prev, ...updates }));
  };

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Frecuencia del próximo pago</legend>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-xl border border-border bg-background/60 dark:bg-gray-900/50 p-1">
        {PAYMENT_SCHEDULE_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            aria-pressed={value.mode === mode}
            onClick={() => setField({ mode })}
            className={`inline-flex min-h-9 items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${value.mode === mode
              ? 'bg-primary-solid text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {value.mode === 'monthly' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">Día aprox.</span>
              <input type="number" min={1} max={31} value={value.expectedPaymentDay} onChange={event => setField({ expectedPaymentDay: event.target.value })} className="input-base text-sm" />
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">Esta vez</span>
              <input type="date" value={value.nextPaymentDate} onChange={event => setField({ nextPaymentDate: event.target.value })} className="input-base text-sm" />
            </label>
          </div>

          {/* Cuota periódica: marca el préstamo como pagable en cuotas fijas y
              habilita "Marcar cuota pagada" en un paso (sin historial redundante). */}
          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={value.isRecurringPayment}
              onChange={event => setField({ isRecurringPayment: event.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary"
            />
            Con pagos periódicos (cuota fija)
          </label>

          {value.isRecurringPayment && (
            <label className="space-y-1 block">
              <span className="block text-xs font-medium text-muted-foreground">Monto de la cuota</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatNumberForInput(value.recurringPaymentAmount)}
                onChange={event => setField({ recurringPaymentAmount: unformatNumber(event.target.value) })}
                placeholder="Monto de la cuota"
                className="input-base text-sm"
              />
            </label>
          )}
        </div>
      )}

      {value.mode === 'date' && (
        <label className="space-y-1 block">
          <span className="block text-xs font-medium text-muted-foreground">Fecha próxima</span>
          <input type="date" value={value.nextPaymentDate} onChange={event => setField({ nextPaymentDate: event.target.value })} className="input-base text-sm" />
        </label>
      )}

      {value.mode === 'months' && (
        <label className="space-y-1 block">
          <span className="block text-xs font-medium text-muted-foreground">En meses</span>
          <input type="number" min={1} max={120} value={value.monthsFromNow} onChange={event => setField({ monthsFromNow: event.target.value })} className="input-base text-sm" />
        </label>
      )}
    </fieldset>
  );
};
