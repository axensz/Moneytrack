/**
 * INVARIANTE del ajuste de saldo (matriz de escenarios):
 *
 *   Tras fijar el saldo de una cuenta en X, el siguiente saldo
 *   calculado/persistido debe ser exactamente X (al centavo).
 *
 * Ejercita el flujo REAL de useAccountForm.handleSubmit (parseo del input
 * incluido) con getAccountBalance = BalanceCalculator sobre el historial
 * COMPLETO (la fuente corregida tras el fix de paginación), y verifica el
 * invariante recalculando el saldo con la(s) transacción(es) de ajuste creadas.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAccountForm } from '../../components/views/accounts/hooks/useAccountForm';
import { BalanceCalculator } from '../../utils/balanceCalculator';
import { unformatNumber } from '../../utils/formatters';
import type { Account, Transaction } from '../../types/finance';

const savings: Account = {
  id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 100_000,
};

let seq = 0;
function tx(overrides: Partial<Transaction> & Pick<Transaction, 'type' | 'amount'>): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    category: 'Otros',
    description: 'tx',
    date: new Date(2026, 4, 1 + seq),
    paid: true,
    accountId: 'sav',
    ...overrides,
  } as Transaction;
}

/**
 * Monta useAccountForm contra un "store" en memoria: getAccountBalance calcula
 * desde el historial completo y addTransaction agrega al mismo historial
 * (simulando el ciclo guardar → recalcular).
 */
function setup(initialTxs: Transaction[]) {
  const store = { txs: [...initialTxs] };
  const balance = () => BalanceCalculator.calculateAccountBalance(savings, store.txs);
  const hook = renderHook(() =>
    useAccountForm({
      addAccount: vi.fn(async () => {}),
      updateAccount: vi.fn(async () => {}),
      addTransaction: vi.fn(async (t: Omit<Transaction, 'id'>) => {
        store.txs.push({ ...t, id: `adj${store.txs.length}` } as Transaction);
      }),
      getAccountBalance: balance,
      getCreditUsed: () => 0,
      formatCurrency: (n) => `$${n.toLocaleString('es-CO')}`,
    })
  );
  return { hook, store, balance };
}

/** Edita la cuenta, teclea `input` en el campo de ajuste y guarda. */
async function adjustTo(h: ReturnType<typeof setup>, input: string) {
  act(() => h.hook.result.current.openEditForm(savings));
  // Mismo path que la UI: onChange guarda unformatNumber(valor tecleado).
  act(() => h.hook.result.current.setBalanceAdjustment(unformatNumber(input)));
  await act(async () => { await h.hook.result.current.handleSubmit(); });
}

describe('Invariante: saldo fijado en X → saldo calculado = X (matriz)', () => {
  it('cuenta sin transacciones', async () => {
    const h = setup([]);
    await adjustTo(h, '563088,89');
    expect(h.balance()).toBeCloseTo(563_088.89, 2);
  });

  it('cuenta con ingresos', async () => {
    const h = setup([tx({ type: 'income', amount: 503_088.11 })]);
    expect(h.balance()).toBeCloseTo(603_088.11, 2); // 100k inicial + ingreso
    await adjustTo(h, '563088,89');
    expect(h.balance()).toBeCloseTo(563_088.89, 2);
  });

  it('cuenta con gastos (delta positivo → ajuste de ingreso)', async () => {
    const h = setup([tx({ type: 'expense', amount: 80_000 })]);
    expect(h.balance()).toBeCloseTo(20_000, 2);
    await adjustTo(h, '563088,89');
    expect(h.balance()).toBeCloseTo(563_088.89, 2);
  });

  it('cuenta con transferencias salientes y entrantes', async () => {
    const h = setup([
      tx({ type: 'transfer', amount: 30_000, toAccountId: 'oth' }),            // sale de sav
      tx({ type: 'transfer', amount: 12_500, accountId: 'oth', toAccountId: 'sav' }), // entra a sav
    ]);
    expect(h.balance()).toBeCloseTo(100_000 - 30_000 + 12_500, 2);
    await adjustTo(h, '563088,89');
    expect(h.balance()).toBeCloseTo(563_088.89, 2);
  });

  it('transacciones pendientes (paid=false) NO cuentan, y el invariante se mantiene', async () => {
    const h = setup([
      tx({ type: 'expense', amount: 999_999, paid: false }),
      tx({ type: 'income', amount: 50_000 }),
    ]);
    expect(h.balance()).toBeCloseTo(150_000, 2);
    await adjustTo(h, '563088,89');
    expect(h.balance()).toBeCloseTo(563_088.89, 2);
  });

  it('cuenta con un ajuste previo existente (no se duplica ni interfiere)', async () => {
    const h = setup([]);
    await adjustTo(h, '200000');
    expect(h.balance()).toBeCloseTo(200_000, 2);
    await adjustTo(h, '563088,89');
    expect(h.balance()).toBeCloseTo(563_088.89, 2);
    // Dos ajustes en el historial, cada uno aplicado una sola vez.
    expect(h.store.txs.filter(t => t.category === 'Ajuste de saldo' || t.description?.startsWith('Ajuste')).length).toBeGreaterThanOrEqual(2);
  });

  it('editar dos veces seguidas al MISMO valor: la segunda no crea ajuste', async () => {
    const h = setup([tx({ type: 'income', amount: 1_000 })]);
    await adjustTo(h, '563088,89');
    const countAfterFirst = h.store.txs.length;
    await adjustTo(h, '563088,89'); // delta 0 → no debe crear nada
    expect(h.store.txs.length).toBe(countAfterFirst);
    expect(h.balance()).toBeCloseTo(563_088.89, 2);
  });

  it('guardar sin tocar el campo de saldo no crea ajuste', async () => {
    const h = setup([tx({ type: 'income', amount: 1_000 })]);
    const before = h.balance();
    act(() => h.hook.result.current.openEditForm(savings));
    await act(async () => { await h.hook.result.current.handleSubmit(); });
    expect(h.store.txs.length).toBe(1);
    expect(h.balance()).toBeCloseTo(before, 2);
  });

  it('decimales con centavos (coma decimal)', async () => {
    const h = setup([tx({ type: 'income', amount: 0.11 })]);
    await adjustTo(h, '1234,56');
    expect(h.balance()).toBeCloseTo(1_234.56, 2);
  });

  it('formato COP completo: miles con punto y decimales con coma ("2.822.798,94")', async () => {
    const h = setup([]);
    await adjustTo(h, '2.822.798,94');
    expect(h.balance()).toBeCloseTo(2_822_798.94, 2);
  });

  it('input con punto decimal estilo US ("563088.89") vía unformatNumber no infla el ajuste', async () => {
    const h = setup([tx({ type: 'income', amount: 503_088.11 })]);
    await adjustTo(h, '563088.89');
    expect(h.balance()).toBeCloseTo(563_088.89, 2);
  });

  it('delta negativo (bajar el saldo) crea gasto por la diferencia exacta', async () => {
    const h = setup([tx({ type: 'income', amount: 503_088.11 })]); // saldo 603.088,11
    await adjustTo(h, '563088,89');
    const adj = h.store.txs[h.store.txs.length - 1];
    expect(adj.type).toBe('expense');
    expect(adj.amount).toBeCloseTo(39_999.22, 2);
    expect(h.balance()).toBeCloseTo(563_088.89, 2);
  });

  it('delta positivo (subir el saldo) crea ingreso por la diferencia exacta', async () => {
    const h = setup([tx({ type: 'expense', amount: 50_000 })]); // saldo 50.000
    await adjustTo(h, '75000,50');
    const adj = h.store.txs[h.store.txs.length - 1];
    expect(adj.type).toBe('income');
    expect(adj.amount).toBeCloseTo(25_000.50, 2);
    expect(h.balance()).toBeCloseTo(75_000.50, 2);
  });

  it('caso Nequi reportado: 10.694,38 → fija 694,38 → gasto de ajuste 10.000,00 exacto y saldo final 694,38', async () => {
    const h = setup([tx({ type: 'expense', amount: 89_305.62 })]); // 100.000 inicial − 89.305,62 = 10.694,38
    expect(h.balance()).toBeCloseTo(10_694.38, 2);
    await adjustTo(h, '694,38');
    const adj = h.store.txs[h.store.txs.length - 1];
    expect(adj.type).toBe('expense');
    expect(adj.amount).toBeCloseTo(10_000.00, 2);
    expect(h.balance()).toBeCloseTo(694.38, 2);
  });

  it('delta cero exacto: no se crea transacción', async () => {
    const h = setup([tx({ type: 'income', amount: 463_088.89 })]); // saldo 563.088,89
    await adjustTo(h, '563088,89');
    expect(h.store.txs.length).toBe(1);
    expect(h.balance()).toBeCloseTo(563_088.89, 2);
  });
});
