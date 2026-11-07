import { addMonthsClamped, normalizePaymentDay } from '../../../../utils/debtPaymentSchedule';
import { ensureDate } from '../../../../utils/dateUtils';
import { formatDateForInput, parseCurrency, parseDateFromInput } from '../../../../utils/formatters';
import type { Debt } from '../../../../types/finance';

export type PaymentScheduleMode = 'none' | 'monthly' | 'date' | 'months';

export interface PaymentScheduleFormState {
  mode: PaymentScheduleMode;
  expectedPaymentDay: string;
  nextPaymentDate: string;
  monthsFromNow: string;
  /** Préstamo con cuota periódica (solo aplica en modo mensual). */
  isRecurringPayment: boolean;
  /** Monto de la cuota periódica (texto del input). */
  recurringPaymentAmount: string;
}

export const PAYMENT_SCHEDULE_MODES: { mode: PaymentScheduleMode; label: string }[] = [
  { mode: 'none', label: 'Sin fecha' },
  { mode: 'monthly', label: 'Mensual' },
  { mode: 'date', label: 'Fecha' },
  { mode: 'months', label: 'Meses' },
];

export const createEmptyPaymentScheduleForm = (): PaymentScheduleFormState => ({
  mode: 'none',
  expectedPaymentDay: '15',
  nextPaymentDate: '',
  monthsFromNow: '1',
  isRecurringPayment: false,
  recurringPaymentAmount: '',
});

export const createPaymentScheduleFormFromDebt = (debt: Debt): PaymentScheduleFormState => {
  const expectedPaymentDay = normalizePaymentDay(debt.expectedPaymentDay);
  const nextPaymentDate = debt.nextPaymentDate
    ? formatDateForInput(ensureDate(debt.nextPaymentDate))
    : '';
  const isRecurringPayment = Boolean(debt.isRecurringPayment) && Boolean(expectedPaymentDay);
  const recurringPaymentAmount = typeof debt.recurringPaymentAmount === 'number'
    && Number.isFinite(debt.recurringPaymentAmount)
    ? String(debt.recurringPaymentAmount)
    : '';

  return {
    mode: expectedPaymentDay ? 'monthly' : nextPaymentDate ? 'date' : 'none',
    expectedPaymentDay: expectedPaymentDay ? String(expectedPaymentDay) : '15',
    nextPaymentDate,
    monthsFromNow: '1',
    isRecurringPayment,
    recurringPaymentAmount,
  };
};

const isDateInput = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

type PaymentScheduleUpdates = Pick<
  Debt,
  'expectedPaymentDay' | 'nextPaymentDate' | 'isRecurringPayment' | 'recurringPaymentAmount'
>;

// La cuota periódica solo tiene sentido en modo mensual (necesita un día de cuota).
// En cualquier otro modo se limpia (ausentes = préstamo no periódico, retrocompatible).
const NON_RECURRING: Pick<PaymentScheduleUpdates, 'isRecurringPayment' | 'recurringPaymentAmount'> = {
  isRecurringPayment: undefined,
  recurringPaymentAmount: undefined,
};

export const buildPaymentScheduleUpdates = (
  form: PaymentScheduleFormState,
): { updates?: PaymentScheduleUpdates; error?: string } => {
  if (form.mode === 'none') {
    return { updates: { expectedPaymentDay: undefined, nextPaymentDate: undefined, ...NON_RECURRING } };
  }

  if (form.mode === 'monthly') {
    const expectedPaymentDay = Number(form.expectedPaymentDay);
    if (!Number.isInteger(expectedPaymentDay) || expectedPaymentDay < 1 || expectedPaymentDay > 31) {
      return { error: 'El día mensual debe estar entre 1 y 31' };
    }

    let recurring: Pick<PaymentScheduleUpdates, 'isRecurringPayment' | 'recurringPaymentAmount'> = NON_RECURRING;
    if (form.isRecurringPayment) {
      const recurringPaymentAmount = parseCurrency(form.recurringPaymentAmount);
      if (!Number.isFinite(recurringPaymentAmount) || recurringPaymentAmount <= 0) {
        return { error: 'La cuota periódica debe ser mayor a 0' };
      }
      recurring = { isRecurringPayment: true, recurringPaymentAmount };
    }

    return {
      updates: {
        expectedPaymentDay,
        nextPaymentDate: form.nextPaymentDate && isDateInput(form.nextPaymentDate)
          ? parseDateFromInput(form.nextPaymentDate)
          : undefined,
        ...recurring,
      },
    };
  }

  if (form.mode === 'date') {
    if (!isDateInput(form.nextPaymentDate)) {
      return { error: 'Elige una fecha de próximo pago' };
    }

    return {
      updates: {
        expectedPaymentDay: undefined,
        nextPaymentDate: parseDateFromInput(form.nextPaymentDate),
        ...NON_RECURRING,
      },
    };
  }

  const monthsFromNow = Number(form.monthsFromNow);
  if (!Number.isInteger(monthsFromNow) || monthsFromNow < 1 || monthsFromNow > 120) {
    return { error: 'Los meses deben estar entre 1 y 120' };
  }

  return {
    updates: {
      expectedPaymentDay: undefined,
      nextPaymentDate: addMonthsClamped(new Date(), monthsFromNow),
      ...NON_RECURRING,
    },
  };
};
