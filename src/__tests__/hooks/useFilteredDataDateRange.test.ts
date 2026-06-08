import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilteredData } from '../../hooks/useFilteredData';
import type { Account, Transaction, DateRange } from '../../types/finance';

const bank: Account = {
  id: 'bank', name: 'Banco', type: 'savings', isDefault: true, initialBalance: 0,
};

const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  type: 'expense', amount: 100, category: 'Otros', description: '',
  date: new Date('2026-06-01'), paid: true, accountId: 'bank', ...o,
});

function run(transactions: Transaction[], dateRange: DateRange) {
  return renderHook(() =>
    useFilteredData({
      transactions,
      accounts: [bank],
      filterAccount: 'all',
      filterCategory: 'all',
      dateRange,
      totalBalance: 0,
      getAccountBalance: () => 0,
    }),
  );
}

describe('useFilteredData — rango custom normaliza startDate al inicio del día (#19)', () => {
  it('incluye una transacción del propio día de inicio con hora real (no medianoche)', () => {
    // Rango custom: del 03 al 05 de junio. startDate llega a medianoche local.
    const dateRange: DateRange = {
      preset: 'custom',
      startDate: new Date(2026, 5, 3, 0, 0, 0, 0),
      endDate: new Date(2026, 5, 5, 0, 0, 0, 0),
    };

    // Transacción del día de inicio pero a las 09:30 (hora real > medianoche).
    const morningTx = tx({ id: 'inicio-manana', date: new Date(2026, 5, 3, 9, 30, 0, 0) });

    const { result } = run([morningTx], dateRange);

    // Sin normalizar startDate a 00:00:00 esta quedaba excluida.
    expect(result.current.filteredTransactions.map((t) => t.id)).toContain('inicio-manana');
  });

  it('incluye la transacción del último día con hora avanzada y excluye fuera de rango', () => {
    const dateRange: DateRange = {
      preset: 'custom',
      startDate: new Date(2026, 5, 3, 8, 0, 0, 0), // con hora: igual debe normalizarse
      endDate: new Date(2026, 5, 5, 0, 0, 0, 0),
    };

    const transactions: Transaction[] = [
      tx({ id: 'antes', date: new Date(2026, 5, 2, 23, 0, 0, 0) }),       // fuera (día previo)
      tx({ id: 'inicio', date: new Date(2026, 5, 3, 7, 0, 0, 0) }),       // dentro (día de inicio, mañana temprano)
      tx({ id: 'fin-noche', date: new Date(2026, 5, 5, 22, 0, 0, 0) }),   // dentro (último día, noche)
      tx({ id: 'despues', date: new Date(2026, 5, 6, 1, 0, 0, 0) }),      // fuera (día siguiente)
    ];

    const { result } = run(transactions, dateRange);
    const ids = result.current.filteredTransactions.map((t) => t.id).sort();

    expect(ids).toEqual(['fin-noche', 'inicio']);
  });
});
