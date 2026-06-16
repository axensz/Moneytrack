/**
 * Guard anti-flood de alertas por transacción (reporte jun-2026):
 * "Cargar más" (paginación) añade cientos de ids antiguos al array de
 * transacciones de golpe; el detector de "transacciones nuevas" por diff de ids
 * las trataba como recién creadas y disparaba una alerta de gasto inusual /
 * presupuesto por CADA una (flood de notificaciones).
 *
 * Regla: solo las transacciones con createdAt RECIENTE (< 2 min) disparan
 * alertas individuales. Las históricas (createdAt viejo o ausente) entran al
 * array sin alertar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotificationMonitoring } from '../../hooks/useNotificationMonitoring';
import type { NotificationManager } from '../../services/NotificationManager';
import type { Transaction } from '../../types/finance';

const notificationManager = {
  deps: {
    preferences: {
      thresholds: { lowBalance: 50_000, budgetWarning: 80, unusualSpendingPct: 200 },
      enabled: true,
      quietHours: { enabled: false, start: '22:00', end: '07:00' },
      types: {},
    },
  },
  createNotification: vi.fn(async () => {}),
  cleanupDebounceMap: vi.fn(),
} as unknown as NotificationManager;

let seq = 0;
function tx(createdAt: Date, overrides: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    type: 'expense',
    amount: 100_000,
    category: 'Comida',
    description: 'x',
    date: createdAt,
    paid: true,
    accountId: 'sav',
    createdAt,
    ...overrides,
  } as Transaction;
}

function mount(initial: Transaction[]) {
  return renderHook(
    ({ transactions }) =>
      useNotificationMonitoring({
        userId: 'user1',
        transactions,
        budgets: [],
        recurringPayments: [],
        accounts: [],
        debts: [],
        notificationManager,
      }),
    { initialProps: { transactions: initial } }
  );
}

describe('useNotificationMonitoring — guard anti-flood por paginación', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 9, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cargar transacciones ANTIGUAS por paginación NO dispara alertas individuales', async () => {
    const old = new Date(2026, 1, 1);
    const initial = [tx(old)];
    const { result, rerender } = mount(initial);

    const spending = result.current.monitors.spendingAnalyzer!;
    const spy = vi.spyOn(spending, 'evaluateUnusualSpending').mockResolvedValue(undefined);

    // "Cargar más": entran 200 transacciones históricas (ids nuevos, createdAt viejo).
    const olderPage = Array.from({ length: 200 }, () => tx(old));
    await act(async () => {
      rerender({ transactions: [...initial, ...olderPage] });
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('una transacción recién CREADA por el usuario SÍ dispara la evaluación', async () => {
    const old = new Date(2026, 1, 1);
    const initial = [tx(old)];
    const { result, rerender } = mount(initial);

    const spending = result.current.monitors.spendingAnalyzer!;
    const spy = vi.spyOn(spending, 'evaluateUnusualSpending').mockResolvedValue(undefined);
    const balance = result.current.monitors.balanceMonitor!;
    vi.spyOn(balance, 'evaluateBalanceAlerts').mockResolvedValue(undefined);
    const budget = result.current.monitors.budgetMonitor!;
    vi.spyOn(budget, 'evaluateBudgetAlerts').mockResolvedValue(undefined);

    const fresh = tx(new Date(2026, 5, 9, 11, 59, 30)); // creada hace 30s
    await act(async () => {
      rerender({ transactions: [...initial, fresh] });
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].id).toBe(fresh.id);
  });

  it('una tx creada hace ~5 min (desfase de reloj / latencia) SÍ dispara — antes la ventana de 2 min la descartaba (#5)', async () => {
    const old = new Date(2026, 1, 1);
    const initial = [tx(old)];
    const { result, rerender } = mount(initial);

    const spending = result.current.monitors.spendingAnalyzer!;
    const spy = vi.spyOn(spending, 'evaluateUnusualSpending').mockResolvedValue(undefined);
    vi.spyOn(result.current.monitors.balanceMonitor!, 'evaluateBalanceAlerts').mockResolvedValue(undefined);
    vi.spyOn(result.current.monitors.budgetMonitor!, 'evaluateBudgetAlerts').mockResolvedValue(undefined);

    // Creada hace 5 min: real, pero >2 min → bajo la ventana vieja se perdía.
    const skewed = tx(new Date(2026, 5, 9, 11, 55, 0));
    await act(async () => {
      rerender({ transactions: [...initial, skewed] });
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].id).toBe(skewed.id);
  });

  it('transacción sin createdAt (doc legacy vía paginación) NO dispara alertas', async () => {
    const initial = [tx(new Date(2026, 1, 1))];
    const { result, rerender } = mount(initial);

    const spending = result.current.monitors.spendingAnalyzer!;
    const spy = vi.spyOn(spending, 'evaluateUnusualSpending').mockResolvedValue(undefined);

    const legacy = tx(new Date(2026, 1, 1));
    delete (legacy as Partial<Transaction>).createdAt;
    await act(async () => {
      rerender({ transactions: [...initial, legacy] });
    });

    expect(spy).not.toHaveBeenCalled();
  });
});
