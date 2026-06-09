import { describe, it, expect } from 'vitest';
import {
  SavingsAccountStrategy,
  CashAccountStrategy,
  CreditCardStrategy,
  AccountStrategyFactory,
  getCreditCardStrategy,
} from '../../utils/accountStrategies';
import type { Account, Transaction } from '../../types/finance';

// ─── Fixtures ──────────────────────────────────────────────────────

const makeSavings = (overrides?: Partial<Account>): Account => ({
  id: 'acc-savings',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 1_000_000,
  ...overrides,
});

const makeCash = (overrides?: Partial<Account>): Account => ({
  id: 'acc-cash',
  name: 'Efectivo',
  type: 'cash',
  isDefault: false,
  initialBalance: 500_000,
  ...overrides,
});

const makeCredit = (overrides?: Partial<Account>): Account => ({
  id: 'acc-credit',
  name: 'TC Visa',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 5_000_000,
  ...overrides,
});

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx-1',
  type: 'expense',
  amount: 100_000,
  category: 'Alimentación',
  description: 'Test',
  date: new Date('2024-06-01'),
  paid: true,
  accountId: 'acc-savings',
  ...overrides,
});

// ─── SavingsAccountStrategy ────────────────────────────────────────

describe('SavingsAccountStrategy', () => {
  const strategy = new SavingsAccountStrategy();

  it('returns initial balance when no transactions', () => {
    const acc = makeSavings();
    expect(strategy.calculateBalance(acc, [])).toBe(1_000_000);
  });

  it('adds income and subtracts expenses', () => {
    const acc = makeSavings();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'income', amount: 200_000 }),
      makeTx({ id: 'tx-2', accountId: acc.id!, type: 'expense', amount: 50_000 }),
    ];
    // 1,000,000 + 200,000 - 50,000 = 1,150,000
    expect(strategy.calculateBalance(acc, txs)).toBe(1_150_000);
  });

  it('handles outgoing transfers', () => {
    const acc = makeSavings();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'transfer', amount: 300_000, toAccountId: 'other' }),
    ];
    expect(strategy.calculateBalance(acc, txs)).toBe(700_000);
  });

  it('handles incoming transfers', () => {
    const acc = makeSavings();
    const txs = [
      makeTx({ accountId: 'other', type: 'transfer', amount: 150_000, toAccountId: acc.id! }),
    ];
    expect(strategy.calculateBalance(acc, txs)).toBe(1_150_000);
  });

  it('ignores unpaid transactions', () => {
    const acc = makeSavings();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 999_999, paid: false }),
    ];
    expect(strategy.calculateBalance(acc, txs)).toBe(1_000_000);
  });

  it('validates expense within balance', () => {
    const acc = makeSavings();
    const result = strategy.validateTransaction(acc, 500_000, [], 'expense');
    expect(result.valid).toBe(true);
  });

  it('rejects expense exceeding balance', () => {
    const acc = makeSavings();
    const result = strategy.validateTransaction(acc, 2_000_000, [], 'expense');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Saldo insuficiente');
  });

  it('includes in total balance', () => {
    expect(strategy.includeInTotalBalance()).toBe(true);
  });

  it('redondea el balance a centavos para eliminar residuos float (#21)', () => {
    const acc = makeSavings({ initialBalance: 0 });
    // 0.1 + 0.1 + 0.1 - 0.3 deja residuo IEEE-754 sin redondeo
    const txs = [
      makeTx({ id: 't1', accountId: acc.id!, type: 'income', amount: 0.1 }),
      makeTx({ id: 't2', accountId: acc.id!, type: 'income', amount: 0.1 }),
      makeTx({ id: 't3', accountId: acc.id!, type: 'income', amount: 0.1 }),
      makeTx({ id: 't4', accountId: acc.id!, type: 'expense', amount: 0.3 }),
    ];
    expect(strategy.calculateBalance(acc, txs)).toBe(0);
  });
});

// ─── CashAccountStrategy ──────────────────────────────────────────

describe('CashAccountStrategy', () => {
  const strategy = new CashAccountStrategy();

  it('delegates calculation to savings logic', () => {
    const acc = makeCash();
    expect(strategy.calculateBalance(acc, [])).toBe(500_000);
  });

  it('includes in total balance', () => {
    expect(strategy.includeInTotalBalance()).toBe(true);
  });
});

// ─── CreditCardStrategy ───────────────────────────────────────────

describe('CreditCardStrategy', () => {
  const strategy = new CreditCardStrategy();

  it('returns full credit limit when no transactions', () => {
    const acc = makeCredit();
    expect(strategy.calculateBalance(acc, [])).toBe(5_000_000);
  });

  it('reduces available credit by expenses', () => {
    const acc = makeCredit();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 1_000_000 }),
    ];
    // Available = 5,000,000 - 1,000,000 = 4,000,000
    expect(strategy.calculateBalance(acc, txs)).toBe(4_000_000);
  });

  it('considers direct payments (income) to reduce debt', () => {
    const acc = makeCredit();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 2_000_000 }),
      makeTx({ id: 'tx-pay', accountId: acc.id!, type: 'income', amount: 500_000 }),
    ];
    // Used = 2,000,000 - 500,000 = 1,500,000
    // Available = 5,000,000 - 1,500,000 = 3,500,000
    expect(strategy.calculateBalance(acc, txs)).toBe(3_500_000);
  });

  it('considers transfer payments to reduce debt', () => {
    const acc = makeCredit();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 1_000_000 }),
      makeTx({ id: 'tx-transfer', accountId: 'other', type: 'transfer', amount: 400_000, toAccountId: acc.id! }),
    ];
    // Used = 1,000,000 - 400,000 = 600,000
    // Available = 5,000,000 - 600,000 = 4,400,000
    expect(strategy.calculateBalance(acc, txs)).toBe(4_400_000);
  });

  it('used credit never goes below 0', () => {
    const acc = makeCredit();
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 100_000 }),
      makeTx({ id: 'tx-pay', accountId: acc.id!, type: 'income', amount: 500_000 }),
    ];
    // Payments > expenses → used credit = 0, available = full limit
    expect(strategy.calculateBalance(acc, txs)).toBe(5_000_000);
  });

  it('counts an installment purchase at its full amount (not prorated by due installments)', () => {
    const acc = makeCredit();
    const txs = [
      makeTx({
        accountId: acc.id!,
        type: 'expense',
        amount: 1_200_000,
        installments: 12,
        monthlyInstallmentAmount: 100_000,
        date: new Date('2024-01-01'),
      }),
    ];
    // Una compra a cuotas ocupa el cupo completo desde el inicio:
    // Used = 1,200,000 → Available = 5,000,000 - 1,200,000 = 3,800,000
    expect(strategy.getUsedCredit(acc, txs)).toBe(1_200_000);
    expect(strategy.calculateBalance(acc, txs)).toBe(3_800_000);
  });

  it('prefers the persisted usedCredit when present', () => {
    const acc = makeCredit({ usedCredit: 2_000_000 });
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 999_999 }),
    ];
    // Ignora las transacciones en memoria y usa el valor persistido
    expect(strategy.getUsedCredit(acc, txs)).toBe(2_000_000);
    expect(strategy.calculateBalance(acc, txs)).toBe(3_000_000);
  });

  it('validates expense within credit limit', () => {
    const acc = makeCredit();
    const result = strategy.validateTransaction(acc, 3_000_000, [], 'expense');
    expect(result.valid).toBe(true);
  });

  it('rejects expense exceeding available credit', () => {
    const acc = makeCredit();
    const result = strategy.validateTransaction(acc, 6_000_000, [], 'expense');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cupo insuficiente');
  });

  it('rejects payment when no debt exists', () => {
    const acc = makeCredit();
    const result = strategy.validateTransaction(acc, 100_000, [], 'income');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No hay deuda pendiente');
  });

  it('rejects payment exceeding debt', () => {
    const acc = makeCredit();
    const txs = [makeTx({ accountId: acc.id!, type: 'expense', amount: 500_000 })];
    const result = strategy.validateTransaction(acc, 600_000, txs, 'income');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No puedes pagar más');
  });

  it('blocks transfers from credit card', () => {
    const acc = makeCredit();
    const result = strategy.validateTransaction(acc, 100_000, [], 'transfer');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No se pueden realizar transferencias');
  });

  it('does not include in total balance', () => {
    expect(strategy.includeInTotalBalance()).toBe(false);
  });

  // ── #10: la VALIDACIÓN ignora el usedCredit persistido desactualizado ──

  it('validación de gasto detecta deuda fresca del array aunque el persistido vaya por detrás (recompute > persistido)', () => {
    // El campo persistido aún dice 0 (cupo lleno) porque el listener de Firestore
    // va por detrás, pero las transacciones frescas muestran un gasto reciente que
    // ya consumió casi todo el cupo. F4-tc-expense-max: usedCredit = max(persistido,
    // recompute), así que el recompute fresco (mayor) gobierna y se evita aceptar
    // de más. Con SOLO el persistido obsoleto daría cupo completo y aceptaría un
    // gasto que en realidad excede el cupo.
    const acc = makeCredit({ creditLimit: 5_000_000, usedCredit: 0 });
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 4_800_000 }),
    ];
    // recompute = 4,800,000 > persistido = 0 → cupo disponible real = 200,000.
    // Un gasto de 1,000,000 debe rechazarse.
    const overLimit = strategy.validateTransaction(acc, 1_000_000, txs, 'expense');
    expect(overLimit.valid).toBe(false);
    expect(overLimit.error).toContain('Cupo insuficiente');
    // Un gasto que cabe en el cupo real (200,000) sigue siendo válido.
    const withinLimit = strategy.validateTransaction(acc, 150_000, txs, 'expense');
    expect(withinLimit.valid).toBe(true);
  });

  it('validación de pago recalcula la deuda desde las transacciones frescas', () => {
    // Persistido dice 0 (sin deuda), pero hay un gasto reciente en memoria.
    const acc = makeCredit({ usedCredit: 0 });
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 800_000 }),
    ];
    // Pagar 800,000 debe aceptarse (la deuda real, recalculada, es 800,000).
    const ok = strategy.validateTransaction(acc, 800_000, txs, 'income');
    expect(ok.valid).toBe(true);
    // Pagar más de lo recalculado se rechaza.
    const tooMuch = strategy.validateTransaction(acc, 900_000, txs, 'income');
    expect(tooMuch.valid).toBe(false);
    expect(tooMuch.error).toContain('No puedes pagar más');
  });

  it('el display (getUsedCredit) sigue prefiriendo el campo persistido', () => {
    // Confirma que la ruta de display NO cambió: usa el persistido.
    const acc = makeCredit({ usedCredit: 2_000_000 });
    const txs = [makeTx({ accountId: acc.id!, type: 'expense', amount: 999_999 })];
    expect(strategy.getUsedCredit(acc, txs)).toBe(2_000_000);
  });

  // ── R-recompute-submit: el recompute O(N) se difiere; los short-circuits no
  //    deben cambiar ningún outcome ni debilitar F-tc-cupo. ──

  it('R-recompute-submit: gasto rechazado por persistido alto da el mismo resultado', () => {
    // persisted=4,800,000, limit=5,000,000 → disponible persisted-only=200,000.
    // El array trae una compra extra (recompute<persisted). El short-circuit de
    // rechazo aplica y el outcome es el mismo que con max(persisted,recompute).
    const acc = makeCredit({ creditLimit: 5_000_000, usedCredit: 4_800_000 });
    const txs = [makeTx({ accountId: acc.id!, type: 'expense', amount: 100_000 })];
    const result = strategy.validateTransaction(acc, 1_000_000, txs, 'expense');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cupo insuficiente');
  });

  it('R-recompute-submit: pago aceptado por persistido suficiente (sin recompute)', () => {
    // persisted=2,000,000 deuda; pagar 1,500,000 (<=persisted) se acepta aunque el
    // array esté vacío (paginación). max(persisted,recompute) >= persisted >= amount.
    const acc = makeCredit({ usedCredit: 2_000_000 });
    const result = strategy.validateTransaction(acc, 1_500_000, [], 'income');
    expect(result.valid).toBe(true);
  });

  it('R-recompute-submit: pago con persisted>0 pero menor al monto recurre al recompute', () => {
    // persisted=300,000 < amount=500,000 → no aplica short-circuit; el array trae
    // deuda fresca de 600,000 → max=600,000 ≥ 500,000 → acepta.
    const acc = makeCredit({ usedCredit: 300_000 });
    const txs = [makeTx({ accountId: acc.id!, type: 'expense', amount: 600_000 })];
    const result = strategy.validateTransaction(acc, 500_000, txs, 'income');
    expect(result.valid).toBe(true);
  });

  // ── #21: las sumas de balance redondean residuos IEEE-754 ──

  it('redondea el cupo usado recalculado a centavos (sin residuos float)', () => {
    const acc = makeCredit({ creditLimit: 1 });
    // 0.1 + 0.2 === 0.30000000000000004 sin redondeo
    const txs = [
      makeTx({ accountId: acc.id!, type: 'expense', amount: 0.1 }),
      makeTx({ id: 'tx-2', accountId: acc.id!, type: 'expense', amount: 0.2 }),
    ];
    expect(strategy.getUsedCredit(acc, txs)).toBe(0.3);
  });

  it('getUsedCredit returns used amount', () => {
    const acc = makeCredit();
    const txs = [makeTx({ accountId: acc.id!, type: 'expense', amount: 750_000 })];
    expect(strategy.getUsedCredit(acc, txs)).toBe(750_000);
  });

  // ── F4-tc-expense-max: la VALIDACIÓN de gasto usa Math.max(persistido, recompute) ──
  // Regresión: antes la rama de gasto usaba SOLO el recompute desde el array de
  // transacciones. Con historial paginado el array no trae todas las compras, así
  // que el recompute SUBESTIMA la deuda y el validador SOBREESTIMA el cupo disponible,
  // aceptando gastos por encima del límite real. El fix toma el máximo entre el
  // usedCredit persistido (deuda completa) y el recompute fresco.

  it('rechaza un gasto sobre el cupo cuando el persistido es alto pero el array de transacciones está vacío (paginación)', () => {
    // Deuda real (persistida) = 4,800,000 sobre un límite de 5,000,000 → cupo real = 200,000.
    // El array llega vacío (paginación: ninguna de las compras viejas está en memoria),
    // por lo que el recompute daría usedCredit=0 y "cupo disponible"=5,000,000.
    const acc = makeCredit({ creditLimit: 5_000_000, usedCredit: 4_800_000 });
    // Un gasto de 1,000,000 excede el cupo real (200,000).
    // Código viejo (solo recompute=0): availableCredit=5,000,000 → ACEPTABA (bug).
    // Código nuevo (max(4,800,000, 0)=4,800,000): availableCredit=200,000 → RECHAZA.
    const result = strategy.validateTransaction(acc, 1_000_000, [], 'expense');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cupo insuficiente');
  });

  it('rechaza un gasto sobre el cupo cuando el persistido es alto pero el array trae pocas transacciones (paginación parcial)', () => {
    // Persistido = 4,500,000 (deuda completa). El array solo trae una compra de 100,000
    // (el resto del historial está paginado fuera de memoria).
    const acc = makeCredit({ creditLimit: 5_000_000, usedCredit: 4_500_000 });
    const txs = [makeTx({ accountId: acc.id!, type: 'expense', amount: 100_000 })];
    // recompute = 100,000 → viejo: available=4,900,000 → ACEPTABA un gasto de 800,000 (bug).
    // nuevo: max(4,500,000, 100,000)=4,500,000 → available=500,000 → 800,000 RECHAZA.
    const result = strategy.validateTransaction(acc, 800_000, txs, 'expense');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cupo insuficiente');
  });

  it('acepta un gasto que SÍ cabe en el cupo real (dentro del límite tras descontar el persistido)', () => {
    // Mismo escenario de paginación, pero el gasto cabe en el cupo real (200,000).
    const acc = makeCredit({ creditLimit: 5_000_000, usedCredit: 4_800_000 });
    // Gasto de 150,000 ≤ cupo disponible real (200,000) → debe seguir siendo válido.
    const result = strategy.validateTransaction(acc, 150_000, [], 'expense');
    expect(result.valid).toBe(true);
  });
});

// ─── AccountStrategyFactory ────────────────────────────────────────

describe('AccountStrategyFactory', () => {
  it('returns SavingsAccountStrategy for savings', () => {
    const strategy = AccountStrategyFactory.getStrategy('savings');
    expect(strategy).toBeInstanceOf(SavingsAccountStrategy);
  });

  it('returns CashAccountStrategy for cash', () => {
    const strategy = AccountStrategyFactory.getStrategy('cash');
    expect(strategy).toBeInstanceOf(CashAccountStrategy);
  });

  it('returns CreditCardStrategy for credit', () => {
    const strategy = AccountStrategyFactory.getStrategy('credit');
    expect(strategy).toBeInstanceOf(CreditCardStrategy);
  });

  it('throws for unknown account type', () => {
    // @ts-expect-error Testing invalid type
    expect(() => AccountStrategyFactory.getStrategy('crypto')).toThrow('No existe estrategia');
  });

  it('hasStrategy returns true for registered types', () => {
    expect(AccountStrategyFactory.hasStrategy('savings')).toBe(true);
    expect(AccountStrategyFactory.hasStrategy('credit')).toBe(true);
    expect(AccountStrategyFactory.hasStrategy('cash')).toBe(true);
  });

  it('hasStrategy returns false for unregistered types', () => {
    expect(AccountStrategyFactory.hasStrategy('investment')).toBe(false);
  });
});

// ─── getCreditCardStrategy helper ──────────────────────────────────

describe('getCreditCardStrategy', () => {
  it('returns CreditCardStrategy instance', () => {
    const strategy = getCreditCardStrategy();
    expect(strategy).toBeInstanceOf(CreditCardStrategy);
  });
});
