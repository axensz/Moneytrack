import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Transaction } from '../../types/finance';

// ─── Mock firebase/firestore: getDocs registra cada lectura de la colección ──
const getDocsCalls: number[] = [];
let storeDocs: { id: string; data: Record<string, unknown> }[] = [];

vi.mock('firebase/firestore', () => ({
  collection: (..._args: unknown[]) => ({ __c: true }),
  query: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => ({ __orderBy: args }),
  getDocs: vi.fn(async () => {
    getDocsCalls.push(Date.now());
    return {
      docs: storeDocs.map((d) => ({ id: d.id, data: () => d.data })),
    };
  }),
}));

vi.mock('../../lib/firebaseDb', () => ({ db: {} }));

import { useAllTransactions } from '../../hooks/useAllTransactions';

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 't1',
  type: 'expense',
  amount: 1000,
  category: 'Comida',
  description: 'x',
  date: new Date('2026-06-01'),
  paid: true,
  accountId: 'acc1',
  ...overrides,
});

describe('useAllTransactions — R-allTx-refetch', () => {
  beforeEach(() => {
    getDocsCalls.length = 0;
    storeDocs = [{ id: 't1', data: { amount: 1000, date: new Date('2026-06-01'), category: 'Comida', type: 'expense', paid: true, accountId: 'acc1' } }];
  });

  it('hace UN solo fetch al montar (usuario autenticado)', async () => {
    const live = [tx({ id: 't1' })];
    renderHook(() => useAllTransactions('user1', live));
    await waitFor(() => expect(getDocsCalls.length).toBe(1));
  });

  it('NO refetchea al EDITAR campos (mismo set de IDs)', async () => {
    const live = [tx({ id: 't1', amount: 1000 })];
    const { rerender } = renderHook(({ t }) => useAllTransactions('user1', t), {
      initialProps: { t: live },
    });
    await waitFor(() => expect(getDocsCalls.length).toBe(1));

    // Edición: cambia monto/categoría pero NO el id → no debe refetchear.
    rerender({ t: [tx({ id: 't1', amount: 99999, category: 'Otro' })] });
    // Pequeña espera para detectar un refetch indebido.
    await new Promise((r) => setTimeout(r, 20));
    expect(getDocsCalls.length).toBe(1);
  });

  it('refetchea al AGREGAR una transacción (cambia el set de IDs)', async () => {
    const { rerender } = renderHook(({ t }) => useAllTransactions('user1', t), {
      initialProps: { t: [tx({ id: 't1' })] },
    });
    await waitFor(() => expect(getDocsCalls.length).toBe(1));

    rerender({ t: [tx({ id: 't1' }), tx({ id: 't2' })] });
    await waitFor(() => expect(getDocsCalls.length).toBe(2));
  });

  it('refetchea al ELIMINAR (purga la copia stale de fullTxs)', async () => {
    const { rerender } = renderHook(({ t }) => useAllTransactions('user1', t), {
      initialProps: { t: [tx({ id: 't1' }), tx({ id: 't2' })] },
    });
    await waitFor(() => expect(getDocsCalls.length).toBe(1));

    rerender({ t: [tx({ id: 't1' })] });
    await waitFor(() => expect(getDocsCalls.length).toBe(2));
  });

  it('la edición de una tx live se refleja en el resultado sin refetch (precedencia live)', async () => {
    const { result, rerender } = renderHook(({ t }) => useAllTransactions('user1', t), {
      initialProps: { t: [tx({ id: 't1', amount: 1000 })] },
    });
    await waitFor(() => expect(getDocsCalls.length).toBe(1));

    rerender({ t: [tx({ id: 't1', amount: 77777 })] });
    const merged = result.current.find((m) => m.id === 't1');
    expect(merged?.amount).toBe(77777);
    expect(getDocsCalls.length).toBe(1);
  });

  it('modo invitado (sin userId) no fetchea', async () => {
    renderHook(() => useAllTransactions(null, [tx({ id: 't1' })]));
    await new Promise((r) => setTimeout(r, 20));
    expect(getDocsCalls.length).toBe(0);
  });
});
