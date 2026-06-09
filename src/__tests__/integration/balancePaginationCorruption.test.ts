/**
 * REPRO DETERMINISTA del bug de corrupción de saldos al ajustar (reporte jun-2026).
 *
 * MECANISMO (causa raíz):
 * El listener principal (useFirestoreSubscriptions.ts:150) limita las transacciones
 * en memoria a las 500 más recientes (orderBy date desc, limit PAGE_SIZE) sobre
 * TODAS las cuentas. SavingsAccountStrategy.calculateBalance deriva el saldo como
 * initialBalance + Σ(transacciones pagadas EN MEMORIA). Cuando el usuario ya tiene
 * ≥500 transacciones:
 *
 *   1. El delta del ajuste se calcula contra el saldo de la VENTANA (consistente
 *      con lo mostrado, así que hasta aquí no se nota).
 *   2. Al guardar, la transacción de ajuste (date=now) entra por el TOPE de la
 *      ventana → la transacción MÁS ANTIGUA de la ventana es EXPULSADA.
 *   3. El saldo recalculado pierde el efecto de la expulsada:
 *      final = objetivo − (efecto de la tx expulsada)  ≠  objetivo.
 *
 * Estos tests reproducen los DOS escenarios reportados con los números exactos:
 *   A) saldo 603.088,11 → fija 563.088,89 → la app mostró 225.568,89
 *      (la ventana expulsó un INGRESO de 337.520)
 *   B) saldo 2.822.798,94 → fija 563.088,89 → la app mostró 603.088,89
 *      (la ventana expulsó un GASTO de 40.000)
 *
 * Y verifican el INVARIANTE con la fuente corregida (historial completo):
 *   tras fijar el saldo en X, el siguiente saldo calculado es exactamente X.
 */

import { describe, it, expect } from 'vitest';
import { BalanceCalculator } from '../../utils/balanceCalculator';
import { byDateThenCreatedDesc } from '../../hooks/useTransactions';
import { BALANCE_ADJUSTMENT_CATEGORY } from '../../config/constants';
import type { Account, Transaction } from '../../types/finance';

const PAGE_SIZE = 500; // espejo de useFirestoreSubscriptions.PAGE_SIZE

const account: Account = {
  id: 'sav',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 0,
};

let txSeq = 0;
function tx(overrides: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction {
  txSeq += 1;
  return {
    id: `t${txSeq}`,
    category: 'Otros',
    description: 'tx',
    paid: true,
    accountId: 'sav',
    createdAt: overrides.date,
    ...overrides,
  } as Transaction;
}

/** Simula la ventana del listener: las PAGE_SIZE más recientes por fecha desc. */
function paginatedWindow(all: Transaction[]): Transaction[] {
  return [...all].sort(byDateThenCreatedDesc).slice(0, PAGE_SIZE);
}

/**
 * Construye un historial de exactamente 500 transacciones cuyo neto es
 * `windowNet`, con la MÁS ANTIGUA siendo `oldest` (la que será expulsada
 * al guardar el ajuste). Las demás: 498 pares neutros + 1 que cuadra el neto.
 */
function buildHistory(oldest: Transaction, windowNet: number): Transaction[] {
  const txs: Transaction[] = [oldest];
  // 498 transacciones neutras (249 pares ingreso/gasto de 1.000)
  for (let i = 0; i < 249; i++) {
    const d = new Date(2025, 0, 2 + i);
    txs.push(tx({ type: 'income', amount: 1000, date: d }));
    txs.push(tx({ type: 'expense', amount: 1000, date: d }));
  }
  // 1 transacción que cuadra el neto de la ventana
  const remainder = windowNet - (oldest.type === 'income' ? oldest.amount : -oldest.amount);
  txs.push(tx({
    type: remainder >= 0 ? 'income' : 'expense',
    amount: Math.abs(remainder),
    date: new Date(2025, 11, 1),
  }));
  expect(txs).toHaveLength(PAGE_SIZE);
  return txs;
}

/** Simula el flujo real de useAccountForm.handleSubmit para cuentas no-TC. */
function submitBalanceAdjust(source: Transaction[], target: number): Transaction[] {
  const currentBalance = BalanceCalculator.calculateAccountBalance(account, source);
  const adjustment = target - currentBalance;
  if (Math.abs(adjustment) < 0.01) return [];
  return [tx({
    type: adjustment > 0 ? 'income' : 'expense',
    amount: Math.abs(adjustment),
    category: BALANCE_ADJUSTMENT_CATEGORY,
    date: new Date(2026, 5, 9), // "hoy": la más reciente del set
  })];
}

describe('Corrupción de saldo por ventana paginada (repro exacta del reporte)', () => {
  it('Escenario A: 603.088,11 → fija 563.088,89 → la ventana produce 225.568,89 (BUG)', () => {
    const oldest = tx({ type: 'income', amount: 337_520, date: new Date(2025, 0, 1) });
    const fullHistory = buildHistory(oldest, 603_088.11);

    // Antes de editar: ventana = todo el historial (500 justas) → saldo mostrado correcto.
    const windowBefore = paginatedWindow(fullHistory);
    expect(BalanceCalculator.calculateAccountBalance(account, windowBefore)).toBeCloseTo(603_088.11, 2);

    // El usuario fija 563.088,89: el delta se calcula contra la ventana.
    const created = submitBalanceAdjust(windowBefore, 563_088.89);
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe('expense');
    expect(created[0].amount).toBeCloseTo(39_999.22, 2);

    // Tras guardar: 501 txs → la ventana expulsa el ingreso de 337.520.
    const windowAfter = paginatedWindow([...fullHistory, ...created]);
    const buggedBalance = BalanceCalculator.calculateAccountBalance(account, windowAfter);
    expect(buggedBalance).toBeCloseTo(225_568.89, 2); // ← el número del reporte, exacto

    // INVARIANTE (fuente corregida = historial completo): saldo final = objetivo.
    const fixedBalance = BalanceCalculator.calculateAccountBalance(account, [...fullHistory, ...created]);
    expect(fixedBalance).toBeCloseTo(563_088.89, 2);
  });

  it('Escenario B: 2.822.798,94 → fija 563.088,89 → la ventana produce 603.088,89 (BUG, +40.000)', () => {
    const oldest = tx({ type: 'expense', amount: 40_000, date: new Date(2025, 0, 1) });
    const fullHistory = buildHistory(oldest, 2_822_798.94);

    const windowBefore = paginatedWindow(fullHistory);
    expect(BalanceCalculator.calculateAccountBalance(account, windowBefore)).toBeCloseTo(2_822_798.94, 2);

    const created = submitBalanceAdjust(windowBefore, 563_088.89);
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe('expense');
    expect(created[0].amount).toBeCloseTo(2_259_710.05, 2);

    // Tras guardar: la ventana expulsa el gasto de 40.000 → saldo "sube" 40.000.
    const windowAfter = paginatedWindow([...fullHistory, ...created]);
    const buggedBalance = BalanceCalculator.calculateAccountBalance(account, windowAfter);
    expect(buggedBalance).toBeCloseTo(603_088.89, 2); // ← el número del reporte, exacto

    const fixedBalance = BalanceCalculator.calculateAccountBalance(account, [...fullHistory, ...created]);
    expect(fixedBalance).toBeCloseTo(563_088.89, 2);
  });

  it('cualquier transacción nueva (no solo ajustes) corrompe saldos al cruzar las 500', () => {
    const oldest = tx({ type: 'income', amount: 250_000, date: new Date(2025, 0, 1) });
    const fullHistory = buildHistory(oldest, 1_000_000);
    const windowBefore = paginatedWindow(fullHistory);
    expect(BalanceCalculator.calculateAccountBalance(account, windowBefore)).toBeCloseTo(1_000_000, 2);

    // Un gasto normal de 5.000 → el saldo de la ventana cae 255.000 (5.000 + 250.000 expulsados).
    const groceries = tx({ type: 'expense', amount: 5_000, date: new Date(2026, 5, 9) });
    const windowAfter = paginatedWindow([...fullHistory, groceries]);
    expect(BalanceCalculator.calculateAccountBalance(account, windowAfter)).toBeCloseTo(745_000, 2);

    // Con historial completo: 995.000, como corresponde.
    expect(BalanceCalculator.calculateAccountBalance(account, [...fullHistory, groceries])).toBeCloseTo(995_000, 2);
  });
});
