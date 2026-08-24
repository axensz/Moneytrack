/**
 * A3 — PaymentMonitor: umbrales de recordatorio de pagos recurrentes.
 *
 * Aislamos el DESPACHO por umbral (la lógica con riesgo de off-by-one) espiando
 * getDaysUntilDue / isAlreadyPaid, para no depender del cálculo de fechas. Pinea
 * el comportamiento actual: recordatorios DISCRETOS en 0, 1 y 3 días — el día 2
 * NO recibe aviso (schedule deliberado, no escalado <=3). Audit A3.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentMonitor } from '../../services/PaymentMonitor';
import type { RecurringPayment } from '../../types/finance';

const makePayment = (o: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id: 'p1', name: 'Netflix', amount: 30000, category: 'Suscripciones',
  frequency: 'monthly', dueDay: 15, isActive: true, accountId: 'acc1',
  createdAt: new Date('2026-01-01'),
  ...o,
} as RecurringPayment);

const setup = (payments: RecurringPayment[] = [makePayment()]) => {
  const createNotification = vi.fn().mockResolvedValue(undefined);
  const monitor = new PaymentMonitor({ createNotification, recurringPayments: payments, transactions: [] });
  vi.spyOn(monitor, 'isAlreadyPaid').mockReturnValue(false);
  return { monitor, createNotification };
};

describe('PaymentMonitor — umbrales de recordatorio (A3)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T12:00:00')); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it.each([
    [0, /vence hoy/i],
    [1, /vence mañana/i],
    [3, /vence en 3 días/i],
  ])('notifica cuando faltan %i días', async (days, re) => {
    const { monitor, createNotification } = setup();
    vi.spyOn(monitor, 'getDaysUntilDue').mockReturnValue(days as number);
    await monitor.checkUpcomingPayments();
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect((createNotification.mock.calls[0][0] as { message: string }).message).toMatch(re as RegExp);
  });

  it.each([2, 4, 5, 7])('NO notifica cuando faltan %i días (día 2 queda sin aviso por el schedule discreto)', async (days) => {
    const { monitor, createNotification } = setup();
    vi.spyOn(monitor, 'getDaysUntilDue').mockReturnValue(days);
    await monitor.checkUpcomingPayments();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('no notifica si el pago ya está pagado en el ciclo', async () => {
    const { monitor, createNotification } = setup();
    vi.spyOn(monitor, 'getDaysUntilDue').mockReturnValue(0);
    (monitor.isAlreadyPaid as ReturnType<typeof vi.fn>).mockReturnValue(true);
    await monitor.checkUpcomingPayments();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('ignora pagos inactivos', async () => {
    const { monitor, createNotification } = setup([makePayment({ isActive: false })]);
    vi.spyOn(monitor, 'getDaysUntilDue').mockReturnValue(0);
    await monitor.checkUpcomingPayments();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('corre solo una vez por día (guard lastCheckDate)', async () => {
    const { monitor, createNotification } = setup();
    vi.spyOn(monitor, 'getDaysUntilDue').mockReturnValue(0);
    await monitor.checkUpcomingPayments();
    await monitor.checkUpcomingPayments(); // mismo día → debe saltarse
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it.each([
    [12, /vence en 3 días/i],
    [14, /vence mañana/i],
    [15, /vence hoy/i],
    [16, /venció hace 1 día/i],
    [23, /venció hace 8 días/i],
    [30, /venció hace 15 días/i],
  ])('evalúa la cadencia D%s con fechas locales normalizadas', async (day, message) => {
    vi.setSystemTime(new Date(2026, 5, day as number, 12, 0, 0));
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const monitor = new PaymentMonitor({
      createNotification,
      recurringPayments: [makePayment({ dueDay: 15 })],
      transactions: [],
    });

    await monitor.checkUpcomingPayments();

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect((createNotification.mock.calls[0][0] as { message: string }).message).toMatch(message as RegExp);
    expect((createNotification.mock.calls[0][0] as { metadata: { recurringPaymentId: string } }).metadata.recurringPaymentId).toBe('p1');
  });

  it('respeta recurringCycle aunque la fecha persistida esté fuera de la ventana', () => {
    const payment = makePayment({ dueDay: 15 });
    const monitor = new PaymentMonitor({
      createNotification: vi.fn().mockResolvedValue(undefined),
      recurringPayments: [payment],
      transactions: [{
        id: 'tx-pagada', type: 'expense', amount: payment.amount, category: payment.category,
        description: payment.name, date: new Date(2026, 0, 1), paid: true, accountId: 'acc1',
        recurringPaymentId: payment.id, recurringCycle: '2026-5-15',
      }],
    });

    expect(monitor.isAlreadyPaid(payment)).toBe(true);
  });

  it('does not suppress a reminder for a pending transaction in the matching cycle', () => {
    const payment = makePayment({ dueDay: 15 });
    const monitor = new PaymentMonitor({
      createNotification: vi.fn().mockResolvedValue(undefined),
      recurringPayments: [payment],
      transactions: [{
        id: 'tx-pendiente', type: 'expense', amount: payment.amount, category: payment.category,
        description: payment.name, date: new Date(2026, 5, 15), paid: false, accountId: 'acc1',
        recurringPaymentId: payment.id, recurringCycle: '2026-5-15',
      }],
    });

    expect(monitor.isAlreadyPaid(payment)).toBe(false);
  });

  it('recalcula el ciclo el mismo día después de desvincular un pago persistido', async () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const payment = makePayment({ dueDay: 15 });
    const monitor = new PaymentMonitor({
      createNotification,
      recurringPayments: [payment],
      transactions: [],
    });

    await monitor.checkUpcomingPayments();
    monitor.deps.transactions = [{
      id: 'tx-vinculada', type: 'expense', amount: payment.amount, category: payment.category,
      description: payment.name, date: new Date(2026, 5, 15), paid: true, accountId: 'acc1',
      recurringPaymentId: payment.id, recurringCycle: '2026-5-15',
    }];
    await monitor.checkUpcomingPayments();
    monitor.deps.transactions = [];
    await monitor.checkUpcomingPayments();

    expect(createNotification).toHaveBeenCalledTimes(2);
  });

  it('no conserva el estado de un pago eliminado cuando se recrea y reactiva', async () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const original = makePayment({ id: 'p-original', dueDay: 15 });
    const recreated = makePayment({ id: 'p-recreado', dueDay: 15, isActive: false });
    const monitor = new PaymentMonitor({
      createNotification,
      recurringPayments: [original],
      transactions: [],
    });

    await monitor.checkUpcomingPayments();
    monitor.deps.recurringPayments = [];
    await monitor.checkUpcomingPayments();
    monitor.deps.recurringPayments = [recreated];
    await monitor.checkUpcomingPayments();
    monitor.deps.recurringPayments = [{ ...recreated, isActive: true }];
    await monitor.checkUpcomingPayments();

    expect(createNotification).toHaveBeenCalledTimes(2);
    expect((createNotification.mock.calls[0][0] as { metadata: { recurringPaymentId: string } }).metadata.recurringPaymentId).toBe('p-original');
    expect((createNotification.mock.calls[1][0] as { metadata: { recurringPaymentId: string } }).metadata.recurringPaymentId).toBe('p-recreado');
  });

  it('reintenta después de un rechazo sin persistir el guard diario', async () => {
    const createNotification = vi.fn()
      .mockRejectedValueOnce(new Error('notificación no disponible'))
      .mockResolvedValueOnce(undefined);
    const monitor = new PaymentMonitor({
      createNotification,
      recurringPayments: [makePayment({ dueDay: 15 })],
      transactions: [],
    });

    await monitor.checkUpcomingPayments();
    await monitor.checkUpcomingPayments();

    expect(createNotification).toHaveBeenCalledTimes(2);
  });
});
