import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRecurringUtils } from '../../hooks/recurring/useRecurringUtils';
import type { RecurringPayment, Transaction } from '../../types/finance';

const payment = (o: Partial<RecurringPayment>): RecurringPayment => ({
  id: Math.random().toString(36).slice(2),
  name: 'Pago',
  amount: 100_000,
  category: 'Servicios',
  dueDay: 10,
  frequency: 'monthly',
  isActive: true,
  ...o,
});

const paidTx = (recurringPaymentId: string, date: Date): Transaction => ({
  id: Math.random().toString(36).slice(2),
  type: 'expense',
  amount: 100_000,
  category: 'Servicios',
  description: '',
  date,
  paid: true,
  accountId: 'acc-1',
  recurringPaymentId,
});

describe('useRecurringUtils — vencidos', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); // 15 jun 2026
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('marca como vencido un pago cuyo día ya pasó este mes y no se ha pagado', () => {
    const p = payment({ id: 'p1', dueDay: 10 });
    const { result } = renderHook(() => useRecurringUtils([p], []));
    expect(result.current.getDaysOverdue(p)).toBe(5);
    expect(result.current.isOverdue(p)).toBe(true);
  });

  it('no marca vencido si el día aún no llega', () => {
    const p = payment({ id: 'p2', dueDay: 20 });
    const { result } = renderHook(() => useRecurringUtils([p], []));
    expect(result.current.getDaysOverdue(p)).toBe(0);
    expect(result.current.isOverdue(p)).toBe(false);
  });

  it('no marca vencido si ya se pagó este mes', () => {
    const p = payment({ id: 'p3', dueDay: 10 });
    const tx = paidTx('p3', new Date(2026, 5, 11));
    const { result } = renderHook(() => useRecurringUtils([p], [tx]));
    expect(result.current.getDaysOverdue(p)).toBe(0);
    expect(result.current.isOverdue(p)).toBe(false);
  });

  it('incluye los vencidos en stats.overduePayments y los excluye de upcoming', () => {
    const overdue = payment({ id: 'o1', dueDay: 10 });
    const upcoming = payment({ id: 'u1', dueDay: 18 }); // dentro de 3 días
    const { result } = renderHook(() => useRecurringUtils([overdue, upcoming], []));
    expect(result.current.stats.overduePayments.map((p) => p.id)).toEqual(['o1']);
    expect(result.current.stats.upcomingPayments.map((p) => p.id)).toEqual(['u1']);
  });

  it('Total/Mes prorratea los pagos anuales /12 (#2: antes los ignoraba)', () => {
    const monthly = payment({ id: 'm1', amount: 50_000, frequency: 'monthly' });
    const yearly = payment({ id: 'y1', amount: 1_200_000, frequency: 'yearly', dueDay: 10 });
    const { result } = renderHook(() => useRecurringUtils([monthly, yearly], []));
    // 50.000 mensual + 1.200.000/12 = 50.000 + 100.000
    expect(result.current.stats.totalMonthlyAmount).toBe(150_000);
  });

  it('Pendientes excluye anuales que vencen en otro mes (#3)', () => {
    // Mensual día 20 (hoy es 15-jun) → pendiente este mes.
    const monthlyPending = payment({ id: 'm1', dueDay: 20, frequency: 'monthly' });
    // Anual anclado en diciembre (createdAt dic) → vence dic, no junio.
    const yearlyDec = payment({ id: 'y1', dueDay: 10, frequency: 'yearly', createdAt: new Date(2020, 11, 1) });
    const { result } = renderHook(() => useRecurringUtils([monthlyPending, yearlyDec], []));
    expect(result.current.stats.pendingThisMonth).toBe(1); // solo el mensual
  });
});
