/**
 * Validación por fila del import en lote (useImportTransactions).
 *
 * El commit hace writeBatch + increment(usedCredit) por cada fila. Una fila con
 * monto NaN/≤0, cuenta inexistente, o moneda sin TRM NO debe escribirse NI
 * incrementar usedCredit — antes:
 *   - un amount NaN metía increment(NaN) y corrompía el cupo de la TC, y
 *   - una fila sin TRM se omitía de la escritura pero su delta igual incrementaba
 *     usedCredit (los dos loops del chunk estaban desincronizados).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Account } from '../../types/finance';
import type { ImportRow } from '../../hooks/useImportTransactions';

const mockState = vi.hoisted(() => ({
  sets: [] as Array<{ key: string; data: Record<string, unknown> }>,
  updates: [] as Array<{ key: string; data: Record<string, unknown> }>,
  commits: 0,
  gen: 0,
}));

vi.mock('../../lib/firebase', () => ({ db: { __db: true } }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __collection: path }),
  doc: (first: { __collection?: string }, path?: string, id?: string) => {
    if (path === undefined) {
      mockState.gen += 1;
      return { __key: `${first.__collection}/__new${mockState.gen}`, id: `__new${mockState.gen}` };
    }
    return { __key: `${path}/${id}`, id };
  },
  increment: (n: number) => ({ __increment: n }),
  writeBatch: () => ({
    set: (ref: { __key: string }, data: Record<string, unknown>) =>
      mockState.sets.push({ key: ref.__key, data }),
    update: (ref: { __key: string }, data: Record<string, unknown>) =>
      mockState.updates.push({ key: ref.__key, data }),
    commit: async () => { mockState.commits += 1; },
  }),
}));

import { useImportTransactions } from '../../hooks/useImportTransactions';

const accounts: Account[] = [
  { id: 'cc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: 5_000_000, usedCredit: 0 },
  { id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
];

const row = (o: Partial<ImportRow> = {}): ImportRow => ({
  date: new Date('2026-01-10'),
  description: 'X',
  amount: 10_000,
  category: 'Otros',
  type: 'expense',
  accountId: 'cc',
  include: true,
  ...o,
} as ImportRow);

async function runImport(rows: ImportRow[]) {
  const { result } = renderHook(() => useImportTransactions('u1', accounts));
  let res!: Awaited<ReturnType<typeof result.current.importTransactions>>;
  await act(async () => { res = await result.current.importTransactions(rows); });
  return res;
}

const ccUpdates = () => mockState.updates.filter(u => u.key === 'users/u1/accounts/cc');

describe('useImportTransactions — validación por fila', () => {
  beforeEach(() => {
    mockState.sets = [];
    mockState.updates = [];
    mockState.commits = 0;
    mockState.gen = 0;
  });

  it('omite amount NaN y NO mete increment(NaN) en usedCredit', async () => {
    const res = await runImport([
      row({ amount: 10_000 }),
      row({ amount: NaN, description: 'BAD' }),
    ]);
    expect(res.imported).toBe(1);
    expect(mockState.sets).toHaveLength(1);
    // Solo el delta de la fila válida: +10.000, nunca NaN.
    expect(ccUpdates()).toHaveLength(1);
    expect(ccUpdates()[0].data.usedCredit).toEqual({ __increment: 10_000 });
    expect(res.errors.some(e => e.includes('Monto inválido'))).toBe(true);
  });

  it('omite montos ≤ 0', async () => {
    const res = await runImport([row({ amount: 0 }), row({ amount: -500 })]);
    expect(res.imported).toBe(0);
    expect(mockState.sets).toHaveLength(0);
    expect(ccUpdates()).toHaveLength(0);
  });

  it('omite filas con cuenta inexistente', async () => {
    const res = await runImport([row({ accountId: 'ghost' })]);
    expect(res.imported).toBe(0);
    expect(mockState.sets).toHaveLength(0);
    expect(res.errors.some(e => e.includes('Cuenta inexistente'))).toBe(true);
  });

  it('una fila sin TRM ya NO incrementa usedCredit (loops sincronizados)', async () => {
    const res = await runImport([
      row({ amount: 50_000, needsExchangeRate: true, originalCurrency: 'USD' }),
    ]);
    expect(res.imported).toBe(0);
    expect(mockState.sets).toHaveLength(0);
    expect(ccUpdates()).toHaveLength(0); // antes: increment(50000) fantasma
  });

  it('fila válida sí escribe y sube el cupo por +amount', async () => {
    const res = await runImport([row({ amount: 25_000 })]);
    expect(res.imported).toBe(1);
    expect(mockState.sets).toHaveLength(1);
    expect(ccUpdates()[0].data.usedCredit).toEqual({ __increment: 25_000 });
  });

  it('createdAt usa la fecha del extracto, no la de importación (#14)', async () => {
    const statementDate = new Date(2025, 0, 5); // histórico
    await runImport([row({ amount: 10_000, date: statementDate })]);
    expect(mockState.sets[0].data.createdAt).toBe(statementDate);
    expect(mockState.sets[0].data.date).toBe(statementDate);
  });
});
