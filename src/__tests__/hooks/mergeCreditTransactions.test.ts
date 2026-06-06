import { describe, it, expect } from 'vitest';
import { mergeCreditTransactions } from '../../hooks/useCreditCardTransactions';
import type { Transaction } from '../../types/finance';

function tx(id: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id,
    type: 'expense',
    amount,
    category: 'Compras',
    description: `tx-${id}`,
    date: new Date('2024-01-01'),
    paid: false,
    accountId: 'card-1',
    ...extra,
  } as Transaction;
}

describe('mergeCreditTransactions (fix paginación TC)', () => {
  it('devuelve el array live cuando no hay historial completo', () => {
    const live = [tx('a', 100), tx('b', 200)];
    expect(mergeCreditTransactions(live, [])).toBe(live);
  });

  it('agrega transacciones antiguas que no están en el array live', () => {
    const live = [tx('recent', 100)];
    const full = [tx('old-installment', 999)];
    const merged = mergeCreditTransactions(live, full);
    expect(merged).toHaveLength(2);
    expect(merged.map((t) => t.id).sort()).toEqual(['old-installment', 'recent']);
  });

  it('deduplica por id sin contar dos veces las que están en ambos', () => {
    const live = [tx('shared', 100), tx('recent', 50)];
    const full = [tx('shared', 100), tx('old', 999)];
    const merged = mergeCreditTransactions(live, full);
    expect(merged).toHaveLength(3);
    expect(merged.map((t) => t.id).sort()).toEqual(['old', 'recent', 'shared']);
  });

  it('prefiere la versión LIVE ante una coincidencia de id (refleja ediciones recientes)', () => {
    const live = [tx('shared', 500, { description: 'editado-live' })];
    const full = [tx('shared', 100, { description: 'viejo-firestore' })];
    const merged = mergeCreditTransactions(live, full);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(500);
    expect(merged[0].description).toBe('editado-live');
  });

  it('ignora transacciones sin id en el historial completo', () => {
    const live = [tx('a', 100)];
    const full = [{ ...tx('x', 1), id: undefined } as Transaction];
    const merged = mergeCreditTransactions(live, full);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('a');
  });

  it('no muta los arrays de entrada', () => {
    const live = [tx('a', 100)];
    const full = [tx('b', 200)];
    const liveCopy = [...live];
    const fullCopy = [...full];
    mergeCreditTransactions(live, full);
    expect(live).toEqual(liveCopy);
    expect(full).toEqual(fullCopy);
  });
});
