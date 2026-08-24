import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Debt, RecurringPayment, Transaction } from '../../types/finance';
import {
  GUEST_LEDGER_RECOVERY_KEY,
  GUEST_LEDGER_STORAGE_KEY,
  createGuestLedgerFallbackLock,
  createGuestLedgerEnvelope,
  ensureGuestLedgerEnvelope,
  exportGuestLedgerRecovery,
  mutateGuestLedger,
  readGuestLedgerEnvelope,
  subscribeGuestLedger,
  type GuestLedgerData,
  type GuestLedgerStorage,
} from '../../utils/guestLedger';

class MemoryStorage implements GuestLedgerStorage {
  readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  key = vi.fn((index: number) => Array.from(this.values.keys())[index] ?? null);
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

  it('keeps the verified current and recovery snapshot when the next envelope exceeds quota', async () => {
    const storage = new MemoryStorage();
    const original = seed(storage);
    const rawBefore = storage.getItem(GUEST_LEDGER_STORAGE_KEY)!;
    storage.setItem
      .mockImplementationOnce((key, value) => storage.values.set(key, value))
      .mockImplementationOnce(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });

    await expect(mutateGuestLedger(draft => {
      draft.transactions.push(transaction('too-large', 'income', 1));
    }, { storage, operationId: 'too-large', lock: noLock })).rejects.toThrow();

    expect(storage.values.get(GUEST_LEDGER_STORAGE_KEY)).toBe(rawBefore);
    expect(JSON.parse(storage.values.get(GUEST_LEDGER_RECOVERY_KEY)!)).toEqual(original);
    const exported = JSON.parse(exportGuestLedgerRecovery({ storage }));
    expect(exported.current).toBe(rawBefore);
    expect(exported.previous).toBe(rawBefore);
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

  it('does not roll back a competing envelope that wins after setItem but before read-back', async () => {
    const storage = new MemoryStorage();
    const original = seed(storage);
    const rival = createGuestLedgerEnvelope({
      ...original.data,
      transactions: [transaction('remote-winner', 'income', 9)],
    }, {
      revision: 2,
      commitId: 'remote-winner',
      committedAt: '2026-08-24T12:30:00.000Z',
      recentOperationIds: ['remote-winner'],
    });
    let injectWinner = true;
    storage.setItem.mockImplementation((key, value) => {
      storage.values.set(key, value);
      if (key === GUEST_LEDGER_STORAGE_KEY && injectWinner) {
        injectWinner = false;
        storage.values.set(key, JSON.stringify(rival));
      }
    });

    await mutateGuestLedger(draft => {
      draft.transactions.push(transaction('local-retry', 'expense', 3));
    }, { storage, operationId: 'local-retry', lock: noLock, maxRetries: 3 });

    const persisted = readGuestLedgerEnvelope({ storage });
    expect(persisted.revision).toBe(3);
    expect(persisted.data.transactions.map(item => item.id).sort()).toEqual([
      'local-retry',
      'remote-winner',
    ]);
  });

  it('preserves concurrent income, expense, card payment, debt payment, and account adjustment', async () => {
    const storage = new MemoryStorage();
    const savings = account();
    const card: Account = {
      id: 'card-1',
      name: 'Visa',
      type: 'credit',
      initialBalance: 0,
      isDefault: false,
      creditLimit: 1_000,
      usedCredit: 100,
    };
    const debt: Debt = {
      id: 'debt-1',
      personName: 'Persona',
      type: 'borrowed',
      originalAmount: 100,
      remainingAmount: 100,
      isSettled: false,
      accountId: savings.id,
    };
    seed(storage, {
      accounts: [savings, card],
      transactions: [transaction('card-purchase', 'expense', 100) as Transaction],
      debts: [debt],
      recurringPayments: [],
    });
    const purchase = JSON.parse(storage.values.get(GUEST_LEDGER_STORAGE_KEY)!).data.transactions[0];
    purchase.accountId = card.id;
    const seeded = JSON.parse(storage.values.get(GUEST_LEDGER_STORAGE_KEY)!);
    seeded.data.transactions[0] = purchase;
    storage.values.set(GUEST_LEDGER_STORAGE_KEY, JSON.stringify(seeded));

    let release!: () => void;
    const allStarted = new Promise<void>(resolve => { release = resolve; });
    let starts = 0;
    const concurrent = (
      operationId: string,
      mutate: (draft: GuestLedgerData) => void,
    ) => mutateGuestLedger(async draft => {
      starts += 1;
      if (starts <= 5) {
        if (starts === 5) release();
        await allStarted;
      }
      mutate(draft);
    }, { storage, operationId, lock: noLock, maxRetries: 8 });

    const cardCredit = {
      ...transaction('card-payment-credit', 'income', 40),
      accountId: card.id!,
      linkedTransactionId: 'card-payment-source',
    };
    const cardSource = {
      ...transaction('card-payment-source', 'expense', 40),
      linkedTransactionId: 'card-payment-credit',
    };

    await Promise.all([
      concurrent('concurrent-income', draft => {
        draft.transactions.push(transaction('income-concurrent', 'income', 20));
      }),
      concurrent('concurrent-expense', draft => {
        draft.transactions.push(transaction('expense-concurrent', 'expense', 5));
      }),
      concurrent('concurrent-card-payment', draft => {
        draft.transactions.push(cardCredit, cardSource);
      }),
      concurrent('concurrent-debt-payment', draft => {
        draft.transactions.push({
          ...transaction('debt-payment', 'expense', 30),
          debtId: debt.id,
        });
        draft.debts = draft.debts.map(item => item.id === debt.id
          ? { ...item, remainingAmount: 70 }
          : item);
      }),
      concurrent('concurrent-account-adjustment', draft => {
        draft.transactions.push({
          ...transaction('account-adjustment', 'expense', 10),
          mutationKind: 'balance-adjustment',
          mutationSource: 'account',
          expectedBefore: 1_000,
          targetBalance: 990,
        });
      }),
    ]);

    const persisted = readGuestLedgerEnvelope({ storage });
    expect(persisted.revision).toBe(6);
    expect(persisted.data.transactions.map(item => item.id)).toEqual(expect.arrayContaining([
      'income-concurrent',
      'expense-concurrent',
      'card-payment-credit',
      'card-payment-source',
      'debt-payment',
      'account-adjustment',
    ]));
    expect(persisted.data.debts[0].remainingAmount).toBe(70);
    expect(persisted.data.accounts.find(item => item.id === card.id)?.usedCredit).toBe(60);
    expect(starts).toBeGreaterThan(5);
  });

  it('preserves legacy card authority and applies only the committed ledger delta', async () => {
    const storage = new MemoryStorage();
    storage.values.set('accounts', JSON.stringify([{
      id: 'legacy-card',
      name: 'Visa legacy',
      type: 'credit',
      initialBalance: 0,
      isDefault: true,
      usedCredit: 50,
    } satisfies Account]));
    storage.values.set('transactions', JSON.stringify([]));
    storage.values.set('debts', JSON.stringify([]));
    storage.values.set('recurringPayments', JSON.stringify([]));

    const migrated = await ensureGuestLedgerEnvelope({ storage, lock: noLock });
    expect(migrated.data.accounts[0].usedCredit).toBe(50);

    const paid = await mutateGuestLedger(draft => {
      draft.transactions.push({
        ...transaction('legacy-card-payment', 'income', 20),
        accountId: 'legacy-card',
      });
    }, { storage, operationId: 'legacy-card-payment', lock: noLock });

    expect(paid.data.accounts[0].usedCredit).toBe(30);
  });

  it('serializes independent fallback clients before either can overwrite the same revision', async () => {
    const storage = new MemoryStorage();
    seed(storage);
    const firstLock = createGuestLedgerFallbackLock(storage, { pollDelayMs: 1 });
    const secondLock = createGuestLedgerFallbackLock(storage, { pollDelayMs: 1 });
    let releaseFirst!: () => void;
    let firstEntered!: () => void;
    const firstIsInside = new Promise<void>(resolve => { firstEntered = resolve; });
    const holdFirst = new Promise<void>(resolve => { releaseFirst = resolve; });

    const first = mutateGuestLedger(async draft => {
      firstEntered();
      await holdFirst;
      draft.transactions.push(transaction('fallback-a', 'income', 10));
    }, { storage, operationId: 'fallback-a', lock: firstLock });

    await firstIsInside;
    const second = mutateGuestLedger(draft => {
      draft.transactions.push(transaction('fallback-b', 'expense', 5));
    }, { storage, operationId: 'fallback-b', lock: secondLock });
    await Promise.resolve();
    expect(storage.getItem(GUEST_LEDGER_STORAGE_KEY)).not.toContain('fallback-b');

    releaseFirst();
    await Promise.all([first, second]);

    expect(readGuestLedgerEnvelope({ storage }).data.transactions.map(item => item.id).sort())
      .toEqual(['fallback-a', 'fallback-b']);
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
