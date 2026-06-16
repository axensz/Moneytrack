/**
 * #8 — handleDelete del wizard de recurrentes debe tener guard síncrono contra
 * doble clic: el botón se deshabilita vía estado (asíncrono), así que dos clics
 * en el mismo tick dispararían dos deletes del mismo id.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecurringPaymentsView } from '../../components/views/recurring/hooks/useRecurringPaymentsView';
import type { RecurringPayment } from '../../types/finance';

const noopAsync = vi.fn(async () => {});
const baseParams = {
  recurringPayments: [] as RecurringPayment[],
  accounts: [],
  isPaidForMonth: () => false,
  getDaysUntilDue: () => 0,
  getDaysOverdue: () => 0,
  getNextDueDate: () => new Date(),
  getPaymentHistory: () => [],
  addRecurringPayment: noopAsync,
  updateRecurringPayment: noopAsync,
  deleteRecurringPayment: noopAsync,
};

describe('useRecurringPaymentsView — guard de borrado', () => {
  it('handleDelete ignora el doble clic concurrente: borra una sola vez', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const deleteSpy = vi.fn(async () => { await gate; });

    const { result } = renderHook(() =>
      useRecurringPaymentsView({ ...baseParams, deleteRecurringPayment: deleteSpy })
    );

    act(() => result.current.confirmDelete('p1'));

    await act(async () => {
      const p1 = result.current.handleDelete();
      const p2 = result.current.handleDelete(); // segundo clic mientras el primero corre
      release();
      await Promise.all([p1, p2]);
    });

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith('p1');
  });
});
