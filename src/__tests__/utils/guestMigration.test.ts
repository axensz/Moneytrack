import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readGuestData,
  countGuestData,
  hasGuestData,
  buildMigrationWrites,
  migrateGuestData,
  type GuestData,
  type WriteOp,
} from '../../utils/guestMigration';
import type { Account, Transaction } from '../../types/finance';

const UID = 'user-123';

function emptyData(): GuestData {
  return {
    accounts: [],
    transactions: [],
    recurringPayments: [],
    debts: [],
    budgets: [],
    savingsGoals: [],
    categories: null,
    planConfig: null,
  };
}

const findByPathSuffix = (writes: WriteOp[], suffix: string) =>
  writes.find((w) => w.path.endsWith(suffix));

describe('readGuestData (S1)', () => {
  beforeEach(() => localStorage.clear());

  it('returns empty collections when localStorage is empty', () => {
    const data = readGuestData();
    expect(hasGuestData(data)).toBe(false);
    expect(countGuestData(data).total).toBe(0);
  });

  it('reads arrays and objects from localStorage', () => {
    localStorage.setItem('accounts', JSON.stringify([{ id: 'a1', name: 'Cash', type: 'cash', isDefault: true, initialBalance: 0 }]));
    localStorage.setItem('transactions', JSON.stringify([{ id: 't1', type: 'expense', amount: 10, category: 'X', description: '', date: '2026-01-01T00:00:00.000Z', paid: true, accountId: 'a1' }]));
    localStorage.setItem('financialPlanConfig', JSON.stringify({ startMonth: '2026-01', declaredIncome: 5000 }));

    const data = readGuestData();
    expect(data.accounts).toHaveLength(1);
    expect(data.transactions).toHaveLength(1);
    expect(data.planConfig?.declaredIncome).toBe(5000);
    expect(hasGuestData(data)).toBe(true);
  });

  it('tolerates corrupt JSON without throwing', () => {
    localStorage.setItem('accounts', '{not valid json');
    localStorage.setItem('transactions', JSON.stringify({ not: 'an array' }));
    const data = readGuestData();
    expect(data.accounts).toEqual([]);
    expect(data.transactions).toEqual([]);
  });

  it('does not count categories/planConfig alone as migratable data', () => {
    localStorage.setItem('financeCategories', JSON.stringify({ expense: ['Custom'], income: [] }));
    localStorage.setItem('financialPlanConfig', JSON.stringify({ startMonth: '2026-01', declaredIncome: 1 }));
    expect(hasGuestData(readGuestData())).toBe(false);
  });
});

describe('buildMigrationWrites (S1)', () => {
  it('preserves local IDs as Firestore doc ids', () => {
    const data = emptyData();
    data.accounts = [
      { id: 'acc-local-1', name: 'Cuenta', type: 'cash', isDefault: true, initialBalance: 100 } as Account,
    ];
    const writes = buildMigrationWrites(data, UID);
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(`users/${UID}/accounts/acc-local-1`);
  });

  it('keeps cross-references intact (transaction.accountId -> account.id)', () => {
    const data = emptyData();
    data.accounts = [{ id: 'acc-1', name: 'A', type: 'savings', isDefault: true, initialBalance: 0 } as Account];
    data.transactions = [
      { id: 'tx-1', type: 'expense', amount: 50, category: 'Food', description: '', date: '2026-02-02T00:00:00.000Z', paid: true, accountId: 'acc-1' } as unknown as Transaction,
    ];
    const writes = buildMigrationWrites(data, UID);
    const tx = findByPathSuffix(writes, '/transactions/tx-1');
    expect(tx?.data.accountId).toBe('acc-1');
  });

  it('converts date strings to Date objects so Firestore stores Timestamps', () => {
    const data = emptyData();
    data.transactions = [
      { id: 'tx-1', type: 'expense', amount: 1, category: 'X', description: '', date: '2026-03-03T10:00:00.000Z', paid: true, accountId: 'a1' } as unknown as Transaction,
    ];
    const writes = buildMigrationWrites(data, UID);
    const tx = findByPathSuffix(writes, '/transactions/tx-1');
    expect(tx?.data.date).toBeInstanceOf(Date);
    expect((tx?.data.date as Date).toISOString()).toBe('2026-03-03T10:00:00.000Z');
  });

  it('strips id and undefined fields from the written data', () => {
    const data = emptyData();
    data.accounts = [
      { id: 'acc-1', name: 'A', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: undefined } as Account,
    ];
    const writes = buildMigrationWrites(data, UID);
    expect(writes[0].data).not.toHaveProperty('id');
    expect(writes[0].data).not.toHaveProperty('creditLimit');
  });

  it('migrates custom categories but skips defaults', () => {
    const data = emptyData();
    // Need at least one main entity so the categories block is exercised in a realistic run.
    data.categories = { expense: ['Alimentación', 'Mascotas'], income: ['Salario', 'Propinas'] };
    const writes = buildMigrationWrites(data, UID);
    const catPaths = writes.filter((w) => w.path.includes('/categories/'));
    const names = catPaths.map((w) => w.data.name);
    expect(names).toContain('Mascotas');
    expect(names).toContain('Propinas');
    expect(names).not.toContain('Alimentación'); // default
    expect(names).not.toContain('Salario'); // default
  });

  it('uses a deterministic id for categories (idempotent)', () => {
    const data = emptyData();
    data.categories = { expense: ['Mascotas'], income: [] };
    const a = buildMigrationWrites(data, UID);
    const b = buildMigrationWrites(data, UID);
    expect(a[0].path).toBe(b[0].path);
  });

  it('migrates planConfig as a singleton settings document', () => {
    const data = emptyData();
    data.planConfig = { startMonth: '2026-01', declaredIncome: 7000 };
    const writes = buildMigrationWrites(data, UID);
    const cfg = findByPathSuffix(writes, '/settings/planConfig');
    expect(cfg?.data).toEqual({ startMonth: '2026-01', declaredIncome: 7000 });
  });

  it('returns no writes for empty data', () => {
    expect(buildMigrationWrites(emptyData(), UID)).toHaveLength(0);
  });
});

describe('migrateGuestData orchestration (S1)', () => {
  beforeEach(() => localStorage.clear());

  it('commits all writes and then clears local data (in that order)', async () => {
    const data = emptyData();
    data.accounts = [{ id: 'a1', name: 'A', type: 'cash', isDefault: true, initialBalance: 0 } as Account];
    data.transactions = [
      { id: 't1', type: 'income', amount: 5, category: 'Salario', description: '', date: '2026-01-01T00:00:00.000Z', paid: true, accountId: 'a1' } as unknown as Transaction,
    ];

    const order: string[] = [];
    const commit = vi.fn(async (writes: WriteOp[]) => {
      order.push('commit');
      expect(writes).toHaveLength(2);
    });
    const clear = vi.fn(() => order.push('clear'));

    const result = await migrateGuestData(UID, { read: () => data, commit, clear });

    expect(result.migrated).toBe(true);
    expect(result.writeCount).toBe(2);
    expect(result.counts.total).toBe(2);
    expect(order).toEqual(['commit', 'clear']);
  });

  it('does NOT clear local data when commit fails (retry-safe)', async () => {
    const data = emptyData();
    data.accounts = [{ id: 'a1', name: 'A', type: 'cash', isDefault: true, initialBalance: 0 } as Account];

    const commit = vi.fn(async () => {
      throw new Error('network down');
    });
    const clear = vi.fn();

    await expect(migrateGuestData(UID, { read: () => data, commit, clear })).rejects.toThrow('network down');
    expect(clear).not.toHaveBeenCalled();
  });

  it('does nothing when there is no guest data', async () => {
    const commit = vi.fn();
    const clear = vi.fn();
    const result = await migrateGuestData(UID, { read: emptyData, commit, clear });
    expect(result.migrated).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('throws without a userId', async () => {
    await expect(migrateGuestData('', { read: emptyData })).rejects.toThrow();
  });

  it('NO pisa el planConfig si la cuenta ya tiene uno (filtra ese write) (#guest-plan)', async () => {
    const data = emptyData();
    data.accounts = [{ id: 'a1', name: 'A', type: 'cash', isDefault: true, initialBalance: 0 } as Account];
    data.planConfig = { startMonth: '2026-03', declaredIncome: 2000 };

    let committed: WriteOp[] = [];
    const commit = vi.fn(async (w: WriteOp[]) => { committed = w; });
    const clear = vi.fn();

    const result = await migrateGuestData(UID, {
      read: () => data, commit, clear,
      planConfigExists: async () => true, // la cuenta YA tiene plan
    });

    expect(result.migrated).toBe(true);
    // Se migra la cuenta pero NO el planConfig (se preserva el de la cuenta).
    expect(findByPathSuffix(committed, '/settings/planConfig')).toBeUndefined();
    expect(findByPathSuffix(committed, '/accounts/a1')).toBeDefined();
    expect(clear).toHaveBeenCalled();
  });

  it('SÍ migra el planConfig del invitado si la cuenta no tiene uno', async () => {
    const data = emptyData();
    data.accounts = [{ id: 'a1', name: 'A', type: 'cash', isDefault: true, initialBalance: 0 } as Account];
    data.planConfig = { startMonth: '2026-03', declaredIncome: 2000 };

    let committed: WriteOp[] = [];
    const commit = vi.fn(async (w: WriteOp[]) => { committed = w; });

    await migrateGuestData(UID, {
      read: () => data, commit, clear: vi.fn(),
      planConfigExists: async () => false, // cuenta nueva, sin plan
    });

    expect(findByPathSuffix(committed, '/settings/planConfig')?.data).toEqual({ startMonth: '2026-03', declaredIncome: 2000 });
  });
});
