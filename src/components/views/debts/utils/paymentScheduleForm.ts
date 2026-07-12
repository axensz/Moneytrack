import { addMonthsClamped, normalizePaymentDay } from '../../../../utils/debtPaymentSchedule';
import { ensureDate } from '../../../../utils/dateUtils';
import { formatDateForInput, parseDateFromInput } from '../../../../utils/formatters';
import type { Debt } from '../../../../types/finance';

export type PaymentScheduleMode = 'none' | 'monthly' | 'date' | 'months';

export interface PaymentScheduleFormState {
  mode: PaymentScheduleMode;
  expectedPaymentDay: string;
  nextPaymentDate: string;
  monthsFromNow: string;
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
});

export const createPaymentScheduleFormFromDebt = (debt: Debt): PaymentScheduleFormState => {
  const expectedPaymentDay = normalizePaymentDay(debt.expectedPaymentDay);
  const nextPaymentDate = debt.nextPaymentDate
    ? formatDateForInput(ensureDate(debt.nextPaymentDate))
    : '';

  return {
    mode: expectedPaymentDay ? 'monthly' : nextPaymentDate ? 'date' : 'none',
    expectedPaymentDay: expectedPaymentDay ? String(expectedPaymentDay) : '15',
    nextPaymentDate,
    monthsFromNow: '1',
  };
};

const isDateInput = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

export const buildPaymentScheduleUpdates = (
  form: PaymentScheduleFormState,
): { updates?: Pick<Debt, 'expectedPaymentDay' | 'nextPaymentDate'>; error?: string } => {
  if (form.mode === 'none') {
    return { updates: { expectedPaymentDay: undefined, nextPaymentDate: undefined } };
  }

  if (form.mode === 'monthly') {
    const expectedPaymentDay = Number(form.expectedPaymentDay);
    if (!Number.isInteger(expectedPaymentDay) || expectedPaymentDay < 1 || expectedPaymentDay > 31) {
      return { error: 'El día mensual debe estar entre 1 y 31' };
    }

    return {
      updates: {
        expectedPaymentDay,
        nextPaymentDate: form.nextPaymentDate && isDateInput(form.nextPaymentDate)
          ? parseDateFromInput(form.nextPaymentDate)
          : undefined,
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
    },
  };
};
