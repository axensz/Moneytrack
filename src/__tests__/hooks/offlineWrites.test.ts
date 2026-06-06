/**
 * S3 — Tras eliminar la cola offline rota, las escrituras de transacciones deben
 * fallar con un error CLARO cuando no hay conexión (nunca "éxito" falso, pérdida
 * silenciosa ni duplicación). La lectura offline la cubre persistentLocalCache.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTransactionsCRUD } from '../../hooks/firestore/useTransactionsCRUD';
import { isOffline } from '../../utils/firestoreHelpers';
import type { Transaction } from '../../types/finance';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

const VALID_TX: Omit<Transaction, 'id' | 'createdAt'> = {
  type: 'expense',
  amount: 100,
  category: 'Alimentación',
  description: 'Café',
  date: new Date('2026-01-01'),
  paid: true,
  accountId: 'acc-1',
};

const OFFLINE_MSG = /sin conexión/i;

describe('isOffline()', () => {
  afterEach(() => setOnline(true));

  it('is true when navigator reports offline', () => {
    setOnline(false);
    expect(isOffline()).toBe(true);
  });

  it('is false when navigator reports online', () => {
    setOnline(true);
    expect(isOffline()).toBe(false);
  });
});

describe('useTransactionsCRUD offline guards (S3)', () => {
  afterEach(() => {
    setOnline(true);
    vi.restoreAllMocks();
  });

  it('addTransaction rejects with a clear message when offline', async () => {
    setOnline(false);
    const { result } = renderHook(() => useTransactionsCRUD('user-1', []));
    await expect(result.current.addTransaction(VALID_TX)).rejects.toThrow(OFFLINE_MSG);
  });

  it('deleteTransaction rejects when offline', async () => {
    setOnline(false);
    const { result } = renderHook(() => useTransactionsCRUD('user-1', []));
    await expect(result.current.deleteTransaction('tx-1')).rejects.toThrow(OFFLINE_MSG);
  });

  it('updateTransaction rejects when offline', async () => {
    setOnline(false);
    const { result } = renderHook(() => useTransactionsCRUD('user-1', []));
    await expect(result.current.updateTransaction('tx-1', { amount: 50 })).rejects.toThrow(OFFLINE_MSG);
  });

  it('addCreditPaymentAtomic rejects when offline', async () => {
    setOnline(false);
    const { result } = renderHook(() => useTransactionsCRUD('user-1', []));
    const sourceTx = { ...VALID_TX, accountId: 'acc-2' };
    await expect(result.current.addCreditPaymentAtomic(VALID_TX, sourceTx)).rejects.toThrow(OFFLINE_MSG);
  });

  it('no-op (no throw) when there is no userId, regardless of connectivity', async () => {
    setOnline(false);
    const { result } = renderHook(() => useTransactionsCRUD(null, []));
    await expect(result.current.addTransaction(VALID_TX)).resolves.toBeUndefined();
  });
});
