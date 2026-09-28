import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentMonitor } from '../../services/PaymentMonitor';
import type { RecurringPayment, Transaction } from '../../types/finance';
import type { RecurringReminderCursor } from '../../utils/recurringReminderCursor';

const payment = (overrides: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id: 'rent', name: 'Arriendo', amount: 1_500_000, category: 'Vivienda',
  frequency: 'monthly', dueDay: 15, isActive: true, accountId: 'checking',
  createdAt: new Date('2026-01-01T12:00:00.000Z'), ...overrides,
});

const cursorStore = (cursor?: RecurringReminderCursor) => ({
  read: vi.fn<(paymentId: string) => RecurringReminderCursor | undefined>(() => cursor),
  persistGuest: vi.fn<(paymentId: string, value: RecurringReminderCursor) => void>(),
  removeGuest: vi.fn<(paymentId: string) => void>(),
});

const setup = ({ cursor, transactions = [], writerPrefix = 'foreground:compat', timeZone = 'America/Bogota' }: {
  cursor?: RecurringReminderCursor; transactions?: Transaction[]; writerPrefix?: string; timeZone?: string;
} = {}) => {
  const createNotification = vi.fn().mockResolvedValue(undefined);
  const store = cursorStore(cursor);
  const monitor = new PaymentMonitor({
    createNotification, recurringPayments: [payment()], transactions, cursorStore: store,
    timeZone, writerPrefix,
  });
  return { createNotification, monitor, store };
};

describe('PaymentMonitor — cursor de calendario local', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('antes de D-3 09:00 no crea lifecycle ni persiste cursor guest', async () => {
    vi.setSystemTime(new Date('2026-06-12T13:59:00.000Z'));
    const { monitor, createNotification, store } = setup();
    await monitor.checkUpcomingPayments();
    expect(createNotification).not.toHaveBeenCalled();
    expect(store.persistGuest).not.toHaveBeenCalled();
  });

  it('el guard incluye stageWindow: 08:59 no bloquea la transición de 09:00', async () => {
    vi.setSystemTime(new Date('2026-06-12T13:59:00.000Z'));
    const { monitor, createNotification } = setup();
    await monitor.checkUpcomingPayments();
    vi.setSystemTime(new Date('2026-06-12T14:00:00.000Z'));
    await monitor.checkUpcomingPayments();
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0]).toMatchObject({
      type: 'recurring', schemaVersion: 2,
      eventKey: 'foreground:compat:recurring:rent:2026-5-15',
      stage: 'd3', stageWindow: 'd3', lifecycleStatus: 'active',
      metadata: { recurringPaymentId: 'rent', recurringCycle: '2026-5-15', localDate: '2026-06-15' },
    });
  });

  it('persiste guest solo después de que el primer stage se creó correctamente', async () => {
    vi.setSystemTime(new Date('2026-06-13T17:00:00.000Z'));
    const { monitor, createNotification, store } = setup({ writerPrefix: 'foreground:guest' });
    await monitor.checkUpcomingPayments();
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(store.persistGuest).toHaveBeenCalledWith('rent', {
      cycleKey: '2026-5-15', dueLocalDate: '2026-06-15', stageWindow: 'd3',
    });
  });

  it('los candidatos nunca adjudican revision ni deliverySource al foreground', async () => {
    vi.setSystemTime(new Date('2026-06-16T14:00:00.000Z'));
    const { monitor, createNotification } = setup();
    await monitor.checkUpcomingPayments();
    const candidate = createNotification.mock.calls[0][0];
    expect(candidate).not.toHaveProperty('revision');
    expect(candidate).not.toHaveProperty('deliverySource');
    expect(candidate).toMatchObject({ stage: 'overdue', stageWindow: 'overdue:0', overdueOccurrence: 0 });
  });

  it.each([
    ['2026-06-12T14:00:00.000Z', 'd3', /vence en 3 días/i],
    ['2026-06-14T14:00:00.000Z', 'd1', /vence mañana/i],
    ['2026-06-15T14:00:00.000Z', 'due', /vence hoy/i],
    ['2026-06-16T14:00:00.000Z', 'overdue:0', /hace 1 día/i],
    ['2026-06-23T14:00:00.000Z', 'overdue:1', /hace 8 días/i],
    ['2026-06-30T14:00:00.000Z', 'overdue:2', /hace 15 días/i],
  ])('conserva copy/cadencia para %s (%s)', async (now, expectedStage, expectedCopy) => {
    vi.setSystemTime(new Date(now));
    const persisted = expectedStage.startsWith('overdue:')
      ? { cycleKey: '2026-5-15', dueLocalDate: '2026-06-15', stageWindow: 'due' as const }
      : undefined;
    const { monitor, createNotification } = setup({ cursor: persisted });
    await monitor.checkUpcomingPayments();
    expect(createNotification.mock.calls[0][0]).toMatchObject({
      stageWindow: expectedStage,
      message: expect.stringMatching(expectedCopy),
    });
  });

  it('usa el prefijo/version de autoridad cuando el runtime ya está disponible', async () => {
    vi.setSystemTime(new Date('2026-06-15T14:00:00.000Z'));
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const monitor = new PaymentMonitor({
      createNotification, recurringPayments: [payment()], transactions: [], cursorStore: cursorStore(),
      timeZone: 'America/Bogota', writerPrefix: 'foreground:v7', authorityConfigVersion: 7,
    });
    await monitor.checkUpcomingPayments();
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'foreground:v7:recurring:rent:2026-5-15', authorityConfigVersion: 7,
    }));
  });

  it('evalúa pago contra el cycleKey persistido aunque now esté dos meses después', async () => {
    vi.setSystemTime(new Date('2026-08-02T14:00:00.000Z'));
    const cursor: RecurringReminderCursor = {
      cycleKey: '2026-5-15', dueLocalDate: '2026-06-15', stageWindow: 'overdue:2',
    };
    const paidJune: Transaction = {
      id: 'paid-june', type: 'expense', amount: 1_500_000, category: 'Vivienda',
      description: 'Arriendo', date: new Date('2026-08-01T12:00:00.000Z'), paid: true,
      accountId: 'checking', recurringPaymentId: 'rent', recurringCycle: '2026-5-15',
    };
    const { monitor, createNotification } = setup({ cursor, transactions: [paidJune] });
    expect(monitor.isAlreadyPaid(payment(), cursor.cycleKey)).toBe(true);
    await monitor.checkUpcomingPayments();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('usa el IANA timeZone configurado para pagos legacy en el borde del ciclo', () => {
    const legacyAtKiritimatiMidnight: Transaction = {
      ...linkedLegacyTransaction(),
      date: new Date('2026-06-14T10:00:00.000Z'),
    };
    const { monitor } = setup({
      transactions: [legacyAtKiritimatiMidnight],
      timeZone: 'Pacific/Kiritimati',
    });

    expect(monitor.isAlreadyPaid(payment(), '2026-5-15')).toBe(true);
  });

  it('un pending en el cycleKey exacto no resuelve ni suprime el reminder', async () => {
    vi.setSystemTime(new Date('2026-06-16T14:00:00.000Z'));
    const cursor: RecurringReminderCursor = {
      cycleKey: '2026-5-15', dueLocalDate: '2026-06-15', stageWindow: 'due',
    };
    const pending = {
      id: 'pending', type: 'expense', amount: 1, category: 'Vivienda', description: 'x',
      date: new Date(), paid: false, accountId: 'checking', recurringPaymentId: 'rent',
      recurringCycle: cursor.cycleKey,
    } as Transaction;
    const { monitor, createNotification } = setup({ cursor, transactions: [pending] });
    await monitor.checkUpcomingPayments();
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0]).toMatchObject({ stageWindow: 'overdue:0' });
  });

  it('reintenta la misma ventana tras rechazo y no persiste un guard falso', async () => {
    vi.setSystemTime(new Date('2026-06-15T14:00:00.000Z'));
    const { monitor, createNotification, store } = setup();
    createNotification.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    await monitor.checkUpcomingPayments();
    await monitor.checkUpcomingPayments();
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(store.persistGuest).toHaveBeenCalledTimes(1);
  });

  it('ignora pagos inactivos', async () => {
    vi.setSystemTime(new Date('2026-06-15T14:00:00.000Z'));
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const monitor = new PaymentMonitor({
      createNotification, recurringPayments: [payment({ isActive: false })], transactions: [],
      cursorStore: cursorStore(), timeZone: 'America/Bogota', writerPrefix: 'foreground:compat',
    });
    await monitor.checkUpcomingPayments();
    expect(createNotification).not.toHaveBeenCalled();
  });
});

function linkedLegacyTransaction(): Transaction {
  return {
    id: 'legacy-rent', type: 'expense', amount: 1_500_000, category: 'Vivienda',
    description: 'Arriendo', date: new Date(), paid: true, accountId: 'checking',
    recurringPaymentId: 'rent', recurringCycle: undefined,
  };
}
