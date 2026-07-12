import React from 'react';
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PAYMENT_SCHEDULE_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setField({ mode })}
            className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors ${value.mode === mode
              ? 'bg-primary-solid text-white'
              : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {value.mode === 'monthly' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="block text-xs text-gray-500 dark:text-gray-400">Día aprox.</span>
            <input type="number" min={1} max={31} value={value.expectedPaymentDay} onChange={event => setField({ expectedPaymentDay: event.target.value })} className="input-base text-sm" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-gray-500 dark:text-gray-400">Esta vez</span>
            <input type="date" value={value.nextPaymentDate} onChange={event => setField({ nextPaymentDate: event.target.value })} className="input-base text-sm" />
          </label>
        </div>
      )}

      {value.mode === 'date' && (
        <label className="space-y-1 block">
          <span className="block text-xs text-gray-500 dark:text-gray-400">Fecha próxima</span>
          <input type="date" value={value.nextPaymentDate} onChange={event => setField({ nextPaymentDate: event.target.value })} className="input-base text-sm" />
        </label>
      )}

      {value.mode === 'months' && (
        <label className="space-y-1 block">
          <span className="block text-xs text-gray-500 dark:text-gray-400">En meses</span>
          <input type="number" min={1} max={120} value={value.monthsFromNow} onChange={event => setField({ monthsFromNow: event.target.value })} className="input-base text-sm" />
        </label>
      )}
    </div>
  );
};
