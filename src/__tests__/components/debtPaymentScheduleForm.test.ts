import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPaymentScheduleUpdates,
  type PaymentScheduleFormState,
} from '../../components/views/debts/utils/paymentScheduleForm';

const baseForm: PaymentScheduleFormState = {
  mode: 'none',
  expectedPaymentDay: '15',
  nextPaymentDate: '',
  monthsFromNow: '1',
};

describe('buildPaymentScheduleUpdates', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('limpia la programación cuando el modo es sin fecha', () => {
    expect(buildPaymentScheduleUpdates(baseForm)).toEqual({
      updates: { expectedPaymentDay: undefined, nextPaymentDate: undefined },
    });
  });

  it('valida el día mensual permitido', () => {
    expect(buildPaymentScheduleUpdates({ ...baseForm, mode: 'monthly', expectedPaymentDay: '0' })).toEqual({
      error: 'El día mensual debe estar entre 1 y 31',
    });
    expect(buildPaymentScheduleUpdates({ ...baseForm, mode: 'monthly', expectedPaymentDay: '32' })).toEqual({
      error: 'El día mensual debe estar entre 1 y 31',
    });
  });

  it('genera una programación mensual con fecha puntual opcional válida', () => {
    const result = buildPaymentScheduleUpdates({
      ...baseForm,
      mode: 'monthly',
      expectedPaymentDay: '31',
      nextPaymentDate: '2026-02-28',
    });

    expect(result.updates?.expectedPaymentDay).toBe(31);
    expect(result.updates?.nextPaymentDate).toEqual(new Date(2026, 1, 28));
  });

  it('requiere una fecha válida para el modo fecha', () => {
    expect(buildPaymentScheduleUpdates({ ...baseForm, mode: 'date', nextPaymentDate: '' })).toEqual({
      error: 'Elige una fecha de próximo pago',
    });
  });

  it('programa una fecha única y elimina el día mensual', () => {
    expect(buildPaymentScheduleUpdates({ ...baseForm, mode: 'date', nextPaymentDate: '2026-07-30' })).toEqual({
      updates: { expectedPaymentDay: undefined, nextPaymentDate: new Date(2026, 6, 30) },
    });
  });

  it('valida y calcula meses futuros con clamp de fin de mes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 12));

    expect(buildPaymentScheduleUpdates({ ...baseForm, mode: 'months', monthsFromNow: '0' })).toEqual({
      error: 'Los meses deben estar entre 1 y 120',
    });
    expect(buildPaymentScheduleUpdates({ ...baseForm, mode: 'months', monthsFromNow: '1' })).toEqual({
      updates: { expectedPaymentDay: undefined, nextPaymentDate: new Date(2026, 1, 28) },
    });
  });
});
