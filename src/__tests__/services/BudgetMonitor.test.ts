/**
 * A3 — BudgetMonitor: umbrales de utilización de presupuesto (warning/critical/exceeded).
 *
 * Default prefs: warning 80%, critical 90%, exceeded 100%. La utilización se calcula
 * sumando los gastos PAGADOS de la categoría en el mes en curso. Probamos fixtures
 * justo bajo/en cada umbral con fechas dentro del mes (fake timers). Audit A3.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BudgetMonitor } from '../../services/BudgetMonitor';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../types/finance';
import type { Budget, Transaction } from '../../types/finance';

let n = 0;
const tx = (amount: number, o: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, type: 'expense', amount, category: 'Comida', description: '',
  date: new Date('2026-06-10'), paid: true, accountId: 'a',
  ...o,
} as Transaction);

const budget = (o: Partial<Budget> = {}): Budget => ({
  id: 'b1', category: 'Comida', monthlyLimit: 100_000, isActive: true,
  ...o,
} as Budget);

const setup = (budgets: Budget[], transactions: Transaction[]) => {
  const createNotification = vi.fn().mockResolvedValue(undefined);
  const monitor = new BudgetMonitor({
    createNotification, preferences: DEFAULT_NOTIFICATION_PREFERENCES, budgets, transactions,
  });
  return { monitor, createNotification };
};

describe('BudgetMonitor — umbrales de presupuesto (A3)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T12:00:00')); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('NO alerta por debajo del 80% (79.999%)', async () => {
    const { monitor, createNotification } = setup([budget()], [tx(79_999)]);
    await monitor.evaluateBudgetAlerts(tx(1));
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('al 80% alerta warning ("Advertencia")', async () => {
    const { monitor, createNotification } = setup([budget()], [tx(80_000)]);
    await monitor.evaluateBudgetAlerts(tx(1));
    expect(createNotification).toHaveBeenCalledTimes(1);
    const n0 = createNotification.mock.calls[0][0] as { title: string; severity: string };
    expect(n0.title).toMatch(/Advertencia/i);
    expect(n0.severity).toBe('warning');
  });

  it('al 90% escala a crítico', async () => {
    const { monitor, createNotification } = setup([budget()], [tx(90_000)]);
    await monitor.evaluateBudgetAlerts(tx(1));
    expect((createNotification.mock.calls[0][0] as { title: string }).title).toMatch(/crítica/i);
  });

  it('al 100% reporta presupuesto excedido (error)', async () => {
    const { monitor, createNotification } = setup([budget()], [tx(100_000)]);
    await monitor.evaluateBudgetAlerts(tx(1));
    const n0 = createNotification.mock.calls[0][0] as { title: string; severity: string };
    expect(n0.title).toMatch(/excedido/i);
    expect(n0.severity).toBe('error');
  });

  it('ignora transacciones que no son gasto', async () => {
    const { monitor, createNotification } = setup([budget()], [tx(100_000)]);
    await monitor.evaluateBudgetAlerts(tx(1, { type: 'income' }));
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('ignora categorías especiales (ajustes)', async () => {
    const { monitor, createNotification } = setup([budget()], [tx(100_000)]);
    await monitor.evaluateBudgetAlerts(tx(1, { category: 'Ajuste' }));
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('no alerta si no hay presupuesto para la categoría', async () => {
    const { monitor, createNotification } = setup([], [tx(100_000)]);
    await monitor.evaluateBudgetAlerts(tx(1));
    expect(createNotification).not.toHaveBeenCalled();
  });
});
