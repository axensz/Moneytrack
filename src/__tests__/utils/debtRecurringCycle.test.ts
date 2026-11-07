/**
 * Helper puro de ciclos para préstamos con pagos periódicos.
 *
 * Verifica que la clave del ciclo (debtCycleKey) sea estable a través del borde
 * de mes y se acote a fin de mes, reutilizando la maquinaria de recurringDates.
 */
import { describe, expect, it } from 'vitest';
import type { Debt, Transaction } from '../../types/finance';
import { debtCycleKey, debtTransactionSatisfiesCycle } from '../../utils/debtRecurringCycle';

const debt = (overrides: Partial<Debt> = {}): Debt => ({
  id: 'd1',
  personName: 'Juan',
  type: 'borrowed',
  originalAmount: 1_200_000,
  remainingAmount: 1_200_000,
  isSettled: false,
  expectedPaymentDay: 15,
  isRecurringPayment: true,
  recurringPaymentAmount: 100_000,
  createdAt: new Date('2026-01-01T12:00:00'),
  ...overrides,
});

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  type: 'expense',
  amount: 100_000,
  category: 'Cobro Préstamo',
  description: 'Pago a Juan',
  date: new Date('2026-03-16T12:00:00'),
  paid: true,
  accountId: 'acc-1',
  debtId: 'd1',
  ...overrides,
});

describe('debtCycleKey', () => {
  it('devuelve la misma clave para dos fechas del mismo ciclo (estable en el borde de mes)', () => {
    const d = debt({ expectedPaymentDay: 15 });
    // El ciclo que abre el 15 de marzo contiene desde el 15/03 hasta antes del 15/04.
    const mid = debtCycleKey(d, new Date('2026-03-20T12:00:00'));
    const nearEnd = debtCycleKey(d, new Date('2026-04-14T12:00:00'));
    expect(mid).not.toBeNull();
    expect(mid).toBe(nearEnd);
  });

  it('cambia de clave al cruzar el día de vencimiento al mes siguiente', () => {
    const d = debt({ expectedPaymentDay: 15 });
    const before = debtCycleKey(d, new Date('2026-04-14T12:00:00'));
    const after = debtCycleKey(d, new Date('2026-04-15T12:00:00'));
    expect(before).not.toBe(after);
  });

  it('acota el día de cuota al último día real del mes (fin de mes)', () => {
    const d = debt({ expectedPaymentDay: 31 });
    // En febrero de 2026 (28 días) el ciclo debe anclarse al 28, no al 31.
    const key = debtCycleKey(d, new Date('2026-02-28T12:00:00'));
    expect(key).toBe('2026-1-28');
  });

  it('devuelve null si la deuda no tiene un día de cuota válido', () => {
    expect(debtCycleKey(debt({ expectedPaymentDay: undefined }))).toBeNull();
    expect(debtCycleKey(debt({ expectedPaymentDay: 0 }))).toBeNull();
  });
});

describe('debtTransactionSatisfiesCycle', () => {
  it('reconoce una transacción del préstamo que salda el ciclo indicado', () => {
    const cycle = '2026-2-15';
    expect(debtTransactionSatisfiesCycle(
      { id: 'd1' },
      transaction({ recurringCycle: cycle }),
      cycle,
    )).toBe(true);
  });

  it('rechaza otra deuda, otro ciclo o una transacción no pagada', () => {
    const cycle = '2026-2-15';
    expect(debtTransactionSatisfiesCycle(
      { id: 'd1' },
      transaction({ recurringCycle: cycle, debtId: 'otra' }),
      cycle,
    )).toBe(false);
    expect(debtTransactionSatisfiesCycle(
      { id: 'd1' },
      transaction({ recurringCycle: '2026-3-15' }),
      cycle,
    )).toBe(false);
    expect(debtTransactionSatisfiesCycle(
      { id: 'd1' },
      transaction({ recurringCycle: cycle, paid: false }),
      cycle,
    )).toBe(false);
  });
});
