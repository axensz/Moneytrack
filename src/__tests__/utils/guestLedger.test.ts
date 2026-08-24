import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Debt, RecurringPayment, Transaction } from '../../types/finance';
import {
  GUEST_LEDGER_RECOVERY_KEY,
  GUEST_LEDGER_STORAGE_KEY,
  createGuestLedgerEnvelope,
  ensureGuestLedgerEnvelope,
  mutateGuestLedger,
  readGuestLedgerEnvelope,
  subscribeGuestLedger,
  type GuestLedgerData,
  type GuestLedgerStorage,
} from '../../utils/guestLedger';

class MemoryStorage implements GuestLedgerStorage {
  readonly values = new Map<string, string>();
  getItem = vi.fn((key: string) => this.values.get(key) ?? null);
  setItem = vi.fn((key: string, value: string) => {
    this.values.set(key, value);
  });
  removeItem = vi.fn((key: string) => {
    this.values.delete(key);
  });
}

const account = (id = 'account-1'): Account => ({
  id,
  name: 'Cuenta',
  type: 'savings',
  initialBalance: 100,
  isDefault: true,
});

const transaction = (
  id: string,
  type: 'income' | 'expense',
  amount: number,
): Transaction => ({
  id,
  type,
  amount,
  category: type === 'income' ? 'Salario' : 'Alimentación',
  description: id,
  date: new Date('2026-08-24T12:00:00.000Z'),
  paid: true,
  accountId: 'account-1',
});

const emptyData = (): GuestLedgerData => ({
  accounts: [account()],
  transactions: [],
  debts: [],
  recurringPayments: [],
});

const seed = (storage: MemoryStorage, data = emptyData()) => {
  const envelope = createGuestLedgerEnvelope(data, {
    revision: 1,
    commitId: 'seed',
    committedAt: '2026-08-24T12:00:00.000Z',
  });
  storage.values.set(GUEST_LEDGER_STORAGE_KEY, JSON.stringify(envelope));
  return envelope;
};

const noLock = async <T>(task: () => Promise<T>): Promise<T> => task();

describe('guest ledger durable envelope', () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    ['setItem failure', new Error('disk unavailable')],
    ['quota failure', new DOMException('quota', 'QuotaExceededError')],
  ])('rejects on %s without changing durable or visible state', async (_label, failure) => {
    const storage = new MemoryStorage();
    const original = seed(storage);
    const rawBefore = storage.getItem(GUEST_LEDGER_STORAGE_KEY);
    const listener = vi.fn();
    const unsubscribe = subscribeGuestLedger(listener);
    storage.setItem.mockImplementationOnce(() => {
      throw failure;
    });

    await expect(mutateGuestLedger(
      draft => {
        draft.transactions.push(transaction('income-1', 'income', 20));
      },
      { storage, operationId: 'income-1', lock: noLock },
    )).rejects.toThrow();

    expect(storage.values.get(GUEST_LEDGER_STORAGE_KEY)).toBe(rawBefore);
    expect(readGuestLedgerEnvelope({ storage })).toEqual(original);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('rejects serialization errors before writing or publishing', async () => {
    const storage = new MemoryStorage();
    seed(storage);
    const rawBefore = storage.getItem(GUEST_LEDGER_STORAGE_KEY);
    const listener = vi.fn();
    const unsubscribe = subscribeGuestLedger(listener);

    await expect(mutateGuestLedger(
      draft => {
        const cyclic: { self?: unknown } = {};
        cyclic.self = cyclic;
        (draft.accounts[0] as Account & { invalid: unknown }).invalid = cyclic;
      },
      { storage, operationId: 'invalid-json', lock: noLock },
    )).rejects.toThrow();

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.values.get(GUEST_LEDGER_STORAGE_KEY)).toBe(rawBefore);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('rolls back the authoritative envelope when read-back verification fails', async () => {
    const storage = new MemoryStorage();
    const original = seed(storage);
    const rawBefore = storage.getItem(GUEST_LEDGER_STORAGE_KEY)!;
    let corruptNextRead = false;
    storage.setItem.mockImplementation((key, value) => {
      storage.values.set(key, value);
      if (key === GUEST_LEDGER_STORAGE_KEY && value !== rawBefore) corruptNextRead = true;
    });
    storage.getItem.mockImplementation((key) => {
      if (key === GUEST_LEDGER_STORAGE_KEY && corruptNextRead) {
        corruptNextRead = false;
        return '{corrupt-read-back';
      }
      return storage.values.get(key) ?? null;
    });

    await expect(mutateGuestLedger(
      draft => {
        draft.transactions.push(transaction('expense-1', 'expense', 5));
      },
      { storage, operationId: 'expense-1', lock: noLock },
    )).rejects.toThrow(/verificar/i);

    expect(storage.values.get(GUEST_LEDGER_STORAGE_KEY)).toBe(rawBefore);
    expect(readGuestLedgerEnvelope({ storage })).toEqual(original);
  });

  it('publishes only after the exact candidate is durable and preserves one previous version', async () => {
    const storage = new MemoryStorage();
    const original = seed(storage);
    const listener = vi.fn((next) => {
      expect(storage.getItem(GUEST_LEDGER_STORAGE_KEY)).toBe(JSON.stringify(next));
    });
    const unsubscribe = subscribeGuestLedger(listener);

    const result = await mutateGuestLedger(
      draft => {
        draft.transactions.push(transaction('income-1', 'income', 20));
      },
      {
        storage,
        operationId: 'income-1',
        createCommitId: () => 'commit-2',
        now: () => new Date('2026-08-24T13:00:00.000Z'),
        lock: noLock,
      },
    );

    expect(result.revision).toBe(2);
    expect(result.data.transactions.map(item => item.id)).toEqual(['income-1']);
    expect(listener).toHaveBeenCalledOnce();
    expect(JSON.parse(storage.getItem(GUEST_LEDGER_RECOVERY_KEY)!)).toEqual(original);
    unsubscribe();
  });

  it('retries a stale revision and reapplies both concurrent intentions without lost updates', async () => {
    const storage = new MemoryStorage();
    seed(storage);
    let releaseBoth!: () => void;
    const bothStarted = new Promise<void>(resolve => { releaseBoth = resolve; });
    let starts = 0;

    const concurrentMutation = (item: Transaction, operationId: string) => mutateGuestLedger(
      async draft => {
        starts += 1;
        if (starts <= 2) {
          if (starts === 2) releaseBoth();
          await bothStarted;
        }
        draft.transactions.push(item);
      },
      { storage, operationId, lock: noLock, maxRetries: 4 },
    );

    await Promise.all([
      concurrentMutation(transaction('income-1', 'income', 30), 'income-1'),
      concurrentMutation(transaction('expense-1', 'expense', 10), 'expense-1'),
    ]);

    const persisted = readGuestLedgerEnvelope({ storage });
    expect(persisted.revision).toBe(3);
    expect(persisted.data.transactions.map(item => item.id).sort()).toEqual([
      'expense-1',
      'income-1',
    ]);
    expect(starts).toBe(3);
  });

  it('migrates legacy critical keys with stable IDs and completes interrupted cleanup idempotently', async () => {
    const storage = new MemoryStorage();
    storage.values.set('accounts', JSON.stringify([
      { name: 'Efectivo', type: 'cash', initialBalance: 10, isDefault: true },
    ]));
    storage.values.set('transactions', JSON.stringify([]));
    storage.values.set('debts', JSON.stringify([]));
    storage.values.set('recurringPayments', JSON.stringify([]));
    storage.removeItem.mockImplementationOnce(() => {
      throw new Error('tab closed during cleanup');
    });

    const first = await ensureGuestLedgerEnvelope({ storage, lock: noLock });
    const stableAccountId = first.data.accounts[0].id;
    expect(stableAccountId).toMatch(/^legacy_accounts_/);
    expect(storage.getItem('accounts')).not.toBeNull();

    const second = await ensureGuestLedgerEnvelope({ storage, lock: noLock });
    expect(second.data.accounts).toHaveLength(1);
    expect(second.data.accounts[0].id).toBe(stableAccountId);
    expect(storage.getItem('accounts')).toBeNull();
  });

  it('rejects invalid legacy references without writing or removing legacy data', async () => {
    const storage = new MemoryStorage();
    storage.values.set('accounts', JSON.stringify([account()]));
    storage.values.set('transactions', JSON.stringify([
      transaction('orphan', 'expense', 5),
    ]));
    const orphan = JSON.parse(storage.values.get('transactions')!);
    orphan[0].accountId = 'missing-account';
    storage.values.set('transactions', JSON.stringify(orphan));

    await expect(ensureGuestLedgerEnvelope({ storage, lock: noLock }))
      .rejects.toThrow(/referencia/i);

    expect(storage.getItem(GUEST_LEDGER_STORAGE_KEY)).toBeNull();
    expect(storage.getItem('accounts')).not.toBeNull();
    expect(storage.getItem('transactions')).not.toBeNull();
  });

  it('accepts debt and recurring collections in the complete after-state', async () => {
    const storage = new MemoryStorage();
    seed(storage);
    const debt = {
      id: 'debt-1',
      type: 'borrowed',
      personName: 'Persona',
      originalAmount: 50,
      remainingAmount: 50,
      isSettled: false,
      accountId: 'account-1',
    } as Debt;
    const recurring = {
      id: 'recurring-1',
      name: 'Internet',
      amount: 5,
      category: 'Servicios',
      frequency: 'monthly',
      dueDay: 1,
      accountId: 'account-1',
      isActive: true,
    } as RecurringPayment;

    const result = await mutateGuestLedger(draft => {
      draft.debts.push(debt);
      draft.recurringPayments.push(recurring);
    }, { storage, operationId: 'compound-1', lock: noLock });

    expect(result.data.debts).toEqual([debt]);
    expect(result.data.recurringPayments).toEqual([recurring]);
  });
});
