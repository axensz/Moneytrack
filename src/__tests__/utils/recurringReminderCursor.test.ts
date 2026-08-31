import { describe, expect, it } from 'vitest';
import type { RecurringPayment } from '../../types/finance';
import {
  REMINDER_STAGE_LOCAL_TIME,
  evaluateRecurringReminderCursor,
  type RecurringReminderCursor,
} from '../../utils/recurringReminderCursor';

const payment = (overrides: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id: 'rent',
  name: 'Arriendo',
  amount: 1_500_000,
  category: 'Vivienda',
  dueDay: 15,
  frequency: 'monthly',
  isActive: true,
  createdAt: new Date('2026-01-01T12:00:00.000Z'),
  ...overrides,
});

const bogota = (localIso: string) => new Date(`${localIso}-05:00`);

const evaluate = (
  localIso: string,
  cursor?: RecurringReminderCursor,
  isPaid: (cycleKey: string) => boolean = () => false,
) => evaluateRecurringReminderCursor({
  payment: payment(),
  now: bogota(localIso),
  timeZone: 'America/Bogota',
  cursor,
  isPaid,
});

describe('evaluateRecurringReminderCursor — ventanas locales de 09:00', () => {
  it('expone una única constante de producto para recurring/debt', () => {
    expect(REMINDER_STAGE_LOCAL_TIME).toBe('09:00');
  });

  it.each([
    ['2026-06-12T08:59:00', null],
    ['2026-06-14T08:59:00', 'd3'],
    ['2026-06-15T08:59:00', 'd1'],
    ['2026-06-16T08:59:00', 'due'],
    ['2026-06-23T08:59:00', 'overdue:0'],
    ['2026-06-30T08:59:00', 'overdue:1'],
    ['2026-07-07T08:59:00', 'overdue:2'],
    ['2027-06-15T08:59:00', 'overdue:51'],
  ])('a las 08:59 %s conserva la ventana anterior', (now, expected) => {
    const persistedJune = now.startsWith('2026-07') || now.startsWith('2027-')
      ? { cycleKey: '2026-5-15', dueLocalDate: '2026-06-15', stageWindow: 'd3' as const }
      : undefined;
    expect(evaluate(now, persistedJune).activeStageWindow).toBe(expected);
  });

  it.each([
    ['2026-06-12T09:00:00', 'd3'],
    ['2026-06-14T09:00:00', 'd1'],
    ['2026-06-15T09:00:00', 'due'],
    ['2026-06-16T09:00:00', 'overdue:0'],
    ['2026-06-23T09:00:00', 'overdue:1'],
    ['2026-06-30T09:00:00', 'overdue:2'],
    ['2026-07-07T09:00:00', 'overdue:3'],
    ['2027-06-15T09:00:00', 'overdue:52'],
  ])('a las 09:00 %s entra exactamente a la nueva ventana', (now, expected) => {
    const persistedJune = now.startsWith('2026-07') || now.startsWith('2027-')
      ? { cycleKey: '2026-5-15', dueLocalDate: '2026-06-15', stageWindow: 'd3' as const }
      : undefined;
    expect(evaluate(now, persistedJune).activeStageWindow).toBe(expected);
  });

  it('hace catch-up solo de la ventana vigente', () => {
    expect(evaluate('2026-06-13T12:00:00').activeStageWindow).toBe('d3');
    expect(evaluate('2026-06-17T12:00:00').activeStageWindow).toBe('overdue:0');
    expect(evaluate('2026-06-23T09:00:00').activeStageWindow).toBe('overdue:1');
  });
});

describe('evaluateRecurringReminderCursor — autoridad durable', () => {
  const juneCursor: RecurringReminderCursor = {
    cycleKey: '2026-5-15',
    dueLocalDate: '2026-06-15',
    stageWindow: 'overdue:2',
  };

  it.each(['2026-07-20T12:00:00', '2026-08-02T09:00:00'])(
    'conserva el cursor impago de junio al reabrir en %s',
    (now) => {
      const result = evaluate(now, juneCursor);
      expect(result.nextCursor.cycleKey).toBe('2026-5-15');
      expect(result.nextCursor.dueLocalDate).toBe('2026-06-15');
    },
  );

  it('sin cursor no reproduce meses nunca persistidos y selecciona el ciclo vigente', () => {
    expect(evaluate('2026-08-02T09:00:00')).toMatchObject({
      activeStageWindow: null,
      nextCursor: {
        cycleKey: '2026-7-15',
        dueLocalDate: '2026-08-15',
        stageWindow: null,
      },
    });
  });

  it('al pagar el cursor salta al último ciclo aplicable sin reproducir julio', () => {
    const result = evaluate(
      '2026-08-16T09:00:00',
      juneCursor,
      (key) => key === juneCursor.cycleKey,
    );

    expect(result.resolvedCycleKey).toBe('2026-5-15');
    expect(result.nextCursor).toMatchObject({
      cycleKey: '2026-7-15',
      dueLocalDate: '2026-08-15',
      stageWindow: 'overdue:0',
    });
  });

  it('recalcula una ventana inválida y nunca propaga overdue negativo o decimal', () => {
    const malformed = { ...juneCursor, stageWindow: 'overdue:-1' } as RecurringReminderCursor;
    expect(evaluate('2026-06-17T12:00:00', malformed).nextCursor.stageWindow)
      .toBe('overdue:0');
  });
});

describe('evaluateRecurringReminderCursor — clamping y anualidad', () => {
  it.each([
    [2025, '2025-02-28'],
    [2024, '2024-02-29'],
  ])('acota dueDay 31 al febrero real de %i', (year, dueLocalDate) => {
    const result = evaluateRecurringReminderCursor({
      payment: payment({ dueDay: 31 }),
      now: bogota(`${year}-02-${year === 2024 ? '26' : '25'}T09:00:00`),
      timeZone: 'America/Bogota',
      isPaid: () => false,
    });
    expect(result.nextCursor.dueLocalDate).toBe(dueLocalDate);
    expect(result.activeStageWindow).toBe('d3');
  });

  it('ancla un pago anual al mes de createdAt en la zona configurada', () => {
    const result = evaluateRecurringReminderCursor({
      payment: payment({
        frequency: 'yearly',
        createdAt: new Date('2024-01-20T15:00:00.000Z'),
        dueDay: 15,
      }),
      now: bogota('2026-01-12T09:00:00'),
      timeZone: 'America/Bogota',
      isPaid: () => false,
    });
    expect(result.nextCursor).toMatchObject({
      cycleKey: '2026-0-15',
      dueLocalDate: '2026-01-15',
      stageWindow: 'd3',
    });
  });
});
