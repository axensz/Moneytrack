import { describe, it, expect } from 'vitest';
import { byDateThenCreatedDesc } from '../../hooks/useTransactions';
import type { Transaction } from '../../types/finance';

function tx(id: string, date: string, createdAt?: string): Transaction {
  return {
    id,
    type: 'expense',
    amount: 100,
    category: 'Compras',
    description: id,
    date: new Date(date),
    paid: true,
    accountId: 'acc-1',
    ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
  } as Transaction;
}

function order(list: Transaction[]): string[] {
  return [...list].sort(byDateThenCreatedDesc).map((t) => t.id!);
}

describe('byDateThenCreatedDesc — orden de transacciones', () => {
  it('ordena por fecha descendente (días distintos)', () => {
    const list = [
      tx('viejo', '2026-06-01'),
      tx('nuevo', '2026-06-05'),
      tx('medio', '2026-06-03'),
    ];
    expect(order(list)).toEqual(['nuevo', 'medio', 'viejo']);
  });

  it('desempata el MISMO día por createdAt descendente (recién creado primero)', () => {
    const list = [
      tx('a', '2026-06-05', '2026-06-05T08:00:00Z'),
      tx('c', '2026-06-05', '2026-06-05T18:00:00Z'),
      tx('b', '2026-06-05', '2026-06-05T12:00:00Z'),
    ];
    expect(order(list)).toEqual(['c', 'b', 'a']);
  });

  it('coloca las transacciones sin createdAt al final de su día', () => {
    const list = [
      tx('sin-created', '2026-06-05'),
      tx('con-created', '2026-06-05', '2026-06-05T10:00:00Z'),
    ];
    expect(order(list)).toEqual(['con-created', 'sin-created']);
  });

  it('combina ambos criterios entre varios días', () => {
    const list = [
      tx('d1-tarde', '2026-06-05', '2026-06-05T20:00:00Z'),
      tx('d2', '2026-06-04', '2026-06-04T09:00:00Z'),
      tx('d1-manana', '2026-06-05', '2026-06-05T07:00:00Z'),
    ];
    expect(order(list)).toEqual(['d1-tarde', 'd1-manana', 'd2']);
  });

  it('maneja date como Timestamp de Firestore (duck-type toDate)', () => {
    const tsTx = (id: string, isoDate: string, isoCreated: string): Transaction =>
      ({
        id,
        type: 'expense',
        amount: 1,
        category: 'x',
        description: id,
        date: { toDate: () => new Date(isoDate) },
        createdAt: { toDate: () => new Date(isoCreated) },
        paid: true,
        accountId: 'a',
      }) as unknown as Transaction;

    const list = [
      tsTx('a', '2026-06-05', '2026-06-05T08:00:00Z'),
      tsTx('b', '2026-06-05', '2026-06-05T19:00:00Z'),
    ];
    expect(order(list)).toEqual(['b', 'a']);
  });
});
