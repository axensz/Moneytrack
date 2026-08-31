import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DebtMonitor, getDebtReminderStage } from '../../services/DebtMonitor';
import type { Debt } from '../../types/finance';

const debt = (overrides: Partial<Debt> = {}): Debt => ({
  id: 'debt-1', personName: 'Ana', type: 'borrowed', originalAmount: 200_000,
  remainingAmount: 200_000, isSettled: false,
  createdAt: new Date('2026-01-01T05:00:00.000Z'), ...overrides,
});
const bogotaDay = (day: number, time = '09:00:00') =>
  new Date(Date.UTC(2026, 0, 1 + day, ...time.split(':').map(Number)) + 5 * 60 * 60 * 1000);
const stage = (type: Debt['type'], day: number, time = '09:00:00') =>
  getDebtReminderStage({ debt: debt({ type }), now: bogotaDay(day, time), timeZone: 'America/Bogota' });

describe('getDebtReminderStage — ventanas exactas de calendario local', () => {
  it.each([
    ['borrowed', 30, '08:59:00', null], ['borrowed', 30, '09:00:00', 'borrowed:30'],
    ['borrowed', 31, '12:00:00', 'borrowed:30'], ['borrowed', 60, '08:59:00', 'borrowed:30'],
    ['borrowed', 60, '09:00:00', 'borrowed:60'], ['borrowed', 65, '12:00:00', 'borrowed:60'],
    ['borrowed', 67, '08:59:00', 'borrowed:60'], ['borrowed', 67, '09:00:00', 'borrowed:weekly:0'],
    ['borrowed', 74, '09:00:00', 'borrowed:weekly:1'], ['borrowed', 242, '09:00:00', 'borrowed:weekly:25'],
    ['lent', 90, '08:59:00', null], ['lent', 90, '09:00:00', 'lent:90'],
    ['lent', 96, '12:00:00', 'lent:90'], ['lent', 97, '08:59:00', 'lent:90'],
    ['lent', 97, '09:00:00', 'lent:weekly:0'], ['lent', 111, '09:00:00', 'lent:weekly:2'],
  ] as const)('%s D%i %s => %s', (type, day, time, expected) => {
    expect(stage(type, day, time)?.stageWindow ?? null).toBe(expected);
  });

  it('catch-up devuelve solo la ventana vigente, sin reproducir hitos vencidos', () => {
    expect(stage('borrowed', 45, '17:00:00')?.stageWindow).toBe('borrowed:30');
    expect(stage('borrowed', 65, '17:00:00')?.stageWindow).toBe('borrowed:60');
    expect(stage('borrowed', 80, '17:00:00')?.stageWindow).toBe('borrowed:weekly:1');
    expect(stage('lent', 110, '17:00:00')?.stageWindow).toBe('lent:weekly:1');
  });

  it('usa dueDate como ancla y no createdAt cuando existe', () => {
    expect(getDebtReminderStage({
      debt: debt({ dueDate: new Date('2026-08-01T05:00:00.000Z') }),
      now: new Date('2026-06-15T17:00:00.000Z'), timeZone: 'America/Bogota',
    })).toBeNull();
  });

  it('getDaysOutstanding conserva dueDate, fallback createdAt y días calendario DST', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T13:00:00.000Z'));
    const monitor = new DebtMonitor({
      createNotification: vi.fn().mockResolvedValue(undefined), debts: [], timeZone: 'America/New_York',
    });
    expect(monitor.getDaysOutstanding(debt({
      createdAt: new Date('2025-01-01T12:00:00.000Z'),
      dueDate: new Date('2026-03-08T05:30:00.000Z'),
    }))).toBe(1);
    expect(monitor.getDaysOutstanding(debt({
      createdAt: new Date('2026-03-08T05:30:00.000Z'), dueDate: undefined,
    }))).toBe(1);
    vi.useRealTimers();
  });
});

describe('DebtMonitor — lifecycle canónico', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  const setup = () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const monitor = new DebtMonitor({
      createNotification, debts: [debt()], timeZone: 'America/Bogota', writerPrefix: 'foreground:compat',
    });
    return { createNotification, monitor };
  };

  it('el guard incluye stageWindow y permite la transición 08:59 → 09:00', async () => {
    vi.setSystemTime(bogotaDay(30, '08:59:00'));
    const { createNotification, monitor } = setup();
    await monitor.checkOverdueDebts();
    vi.setSystemTime(bogotaDay(30, '09:00:00'));
    await monitor.checkOverdueDebts();
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0]).toMatchObject({
      type: 'debt', schemaVersion: 2, eventKey: 'foreground:compat:debt:debt-1',
      stage: 'due', stageWindow: 'due', lifecycleStatus: 'active',
      metadata: { debtId: 'debt-1', localDate: '2026-01-31' },
    });
  });

  it('usa eventKey estable, no mensual, y candidatos sin revision/deliverySource', async () => {
    vi.setSystemTime(bogotaDay(74));
    const { createNotification, monitor } = setup();
    await monitor.checkOverdueDebts();
    const candidate = createNotification.mock.calls[0][0];
    expect(candidate.eventKey).toBe('foreground:compat:debt:debt-1');
    expect(candidate).not.toHaveProperty('revision');
    expect(candidate).not.toHaveProperty('deliverySource');
    expect(candidate).toMatchObject({
      stage: 'overdue', stageWindow: 'overdue:1', overdueOccurrence: 1,
      metadata: { reminderKey: 'borrowed:weekly:1' },
    });
  });

  it('no repite la misma ventana ni depende de cadencia elapsed', async () => {
    vi.setSystemTime(bogotaDay(65));
    const { createNotification, monitor } = setup();
    await monitor.checkOverdueDebts();
    await monitor.checkOverdueDebts();
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('deuda saldada no crea evento', async () => {
    vi.setSystemTime(bogotaDay(120));
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const monitor = new DebtMonitor({
      createNotification, debts: [debt({ isSettled: true })],
      timeZone: 'America/Bogota', writerPrefix: 'foreground:compat',
    });
    await monitor.checkOverdueDebts();
    expect(createNotification).not.toHaveBeenCalled();
  });
});
