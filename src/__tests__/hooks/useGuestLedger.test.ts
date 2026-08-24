import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuestLedger } from '../../hooks/useGuestLedger';
import {
  GUEST_LEDGER_STORAGE_KEY,
  createGuestLedgerEnvelope,
} from '../../utils/guestLedger';
import type { Account, Transaction } from '../../types/finance';

const account: Account = {
  id: 'account-1',
  name: 'Cuenta',
  type: 'savings',
  initialBalance: 100,
  isDefault: true,
};

const income = (id: string): Transaction => ({
  id,
  type: 'income',
  amount: 10,
  category: 'Salario',
  description: id,
  date: new Date('2026-08-24T12:00:00.000Z'),
  paid: true,
  accountId: account.id!,
});

const seed = () => {
  const envelope = createGuestLedgerEnvelope({
    accounts: [account],
    transactions: [],
    debts: [],
    recurringPayments: [],
  }, {
    revision: 1,
    commitId: 'seed',
    committedAt: '2026-08-24T12:00:00.000Z',
  });
  localStorage.setItem(GUEST_LEDGER_STORAGE_KEY, JSON.stringify(envelope));
  return envelope;
};

describe('useGuestLedger', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('hydrates and synchronizes hook instances only after a durable same-tab commit', async () => {
    seed();
    const first = renderHook(() => useGuestLedger());
    const second = renderHook(() => useGuestLedger());
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    await waitFor(() => expect(second.result.current.ready).toBe(true));

    await act(async () => {
      await first.result.current.mutate(draft => {
        draft.transactions.push(income('income-1'));
      }, { operationId: 'income-1' });
    });

    expect(first.result.current.transactions.map(item => item.id)).toEqual(['income-1']);
    expect(second.result.current.transactions.map(item => item.id)).toEqual(['income-1']);
    expect(JSON.parse(localStorage.getItem(GUEST_LEDGER_STORAGE_KEY)!).data.transactions)
      .toHaveLength(1);
  });

  it('keeps visible state unchanged and rejects when persistence fails', async () => {
    seed();
    const { result } = renderHook(() => useGuestLedger());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const rawBefore = localStorage.getItem(GUEST_LEDGER_STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    await act(async () => {
      await expect(result.current.mutate(draft => {
        draft.transactions.push(income('income-failed'));
      }, { operationId: 'income-failed' })).rejects.toThrow();
    });

    expect(result.current.transactions).toEqual([]);
    expect(localStorage.getItem(GUEST_LEDGER_STORAGE_KEY)).toBe(rawBefore);
  });

  it('adopts a verified envelope written by another tab', async () => {
    const first = seed();
    const { result } = renderHook(() => useGuestLedger());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const next = createGuestLedgerEnvelope({
      ...first.data,
      transactions: [income('remote-income')],
    }, {
      revision: 2,
      commitId: 'remote',
      committedAt: '2026-08-24T13:00:00.000Z',
    });
    const raw = JSON.stringify(next);
    localStorage.setItem(GUEST_LEDGER_STORAGE_KEY, raw);

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: GUEST_LEDGER_STORAGE_KEY,
        newValue: raw,
        storageArea: localStorage,
      }));
    });

    expect(result.current.transactions.map(item => item.id)).toEqual(['remote-income']);
    expect(result.current.revision).toBe(2);
  });
});
