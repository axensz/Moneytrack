/**
 * F3-debt-guard — registerDebtPayment / modifyDebtBalance deben RECHAZAR montos
 * <= 0 (o no finitos).
 *
 * INVARIANTE DE DOMINIO: el saldo de un préstamo solo puede MOVERSE mediante un
 * monto positivo finito, acompañado (si hay cuenta) de su transacción compensatoria.
 * Sin el guard, un monto negativo era destructivo:
 *   - registerDebtPayment(id, -X): effectiveAmount = min(-X, remaining) = -X,
 *     newRemaining = max(0, remaining - (-X)) = remaining + X  →  la deuda AUMENTABA
 *     sin transacción que respaldara ese movimiento.
 *   - modifyDebtBalance(id, -X, 'add'): newRemaining = remaining + (-X)  →  la deuda
 *     se REDUCÍA silenciosamente (y 'subtract' con negativo la aumentaba).
 *
 * Este test ejercita el hook real en modo invitado (userId=null → respaldo en
 * localStorage, sin Firestore) sembrando una deuda y verificando que un monto <= 0
 * deja el saldo INTACTO. Con el código viejo estas aserciones FALLARÍAN.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebts } from '../../hooks/useDebts';
import type { Account, Debt, Transaction } from '../../types/finance';
import {
  GUEST_LEDGER_STORAGE_KEY,
  createGuestLedgerEnvelope,
  readGuestLedgerEnvelope,
} from '../../utils/guestLedger';

const seedLedger = (
  debts: Debt[],
  accounts: Account[] = [],
  transactions: Transaction[] = [],
) => {
  const envelope = createGuestLedgerEnvelope({
    accounts,
    transactions,
    debts,
    recurringPayments: [],
  }, { revision: 1, commitId: 'test-seed', committedAt: '2026-08-24T12:00:00.000Z' });
  localStorage.setItem(GUEST_LEDGER_STORAGE_KEY, JSON.stringify(envelope));
};

const SEED_DEBT: Debt = {
  id: 'debt-1',
  personName: 'Ana',
  type: 'lent',
  originalAmount: 1000,
  remainingAmount: 1000,
  // SIN accountId a propósito: aísla la invariante aritmética del saldo sin
  // depender de mover dinero entre cuentas (no se crea ninguna transacción).
  isSettled: false,
  createdAt: new Date('2026-01-01'),
};

/**
 * Renderiza useDebts en modo invitado con la deuda ya sembrada en localStorage.
 * En este modo `debts` === localDebts y todas las mutaciones pasan por
 * setLocalDebts, así que el saldo resultante es observable en result.current.debts.
 */
function renderGuestDebts() {
  seedLedger([SEED_DEBT]);
  // addTransaction espía: NO debe invocarse para montos inválidos.
  const addTransaction = vi.fn<
    (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>
  >(async () => {});
  const utils = renderHook(() =>
    useDebts(null, [], undefined, { addTransaction })
  );
  return { ...utils, addTransaction };
}

function currentDebt(result: { current: ReturnType<typeof useDebts> }): Debt {
  const d = result.current.debts.find((x) => x.id === 'debt-1');
  if (!d) throw new Error('seed debt missing');
  return d;
}

describe('F3-debt-guard: useDebts rechaza montos <= 0', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('registerDebtPayment', () => {
    it('control: un pago positivo SÍ reduce el saldo (sanity check)', async () => {
      const { result } = renderGuestDebts();
      // localStorage se hidrata en un effect tras el mount.
      expect(currentDebt(result).remainingAmount).toBe(1000);

      await act(async () => {
        await result.current.registerDebtPayment('debt-1', 400);
      });

      expect(currentDebt(result).remainingAmount).toBe(600);
    });

    it('un monto NEGATIVO no muta el saldo (antes lo AUMENTABA)', async () => {
      const { result } = renderGuestDebts();
      expect(currentDebt(result).remainingAmount).toBe(1000);

      await act(async () => {
        await result.current.registerDebtPayment('debt-1', -500);
      });

      // Código viejo: max(0, 1000 - min(-500, 1000)) = 1500 → la deuda crecía.
      // Código nuevo: early-return → saldo intacto.
      expect(currentDebt(result).remainingAmount).toBe(1000);
      expect(currentDebt(result).isSettled).toBe(false);
    });

    it('un monto CERO no muta el saldo', async () => {
      const { result } = renderGuestDebts();

      await act(async () => {
        await result.current.registerDebtPayment('debt-1', 0);
      });

      expect(currentDebt(result).remainingAmount).toBe(1000);
    });

    it('un monto NaN no muta el saldo', async () => {
      const { result } = renderGuestDebts();

      await act(async () => {
        await result.current.registerDebtPayment('debt-1', Number.NaN);
      });

      expect(currentDebt(result).remainingAmount).toBe(1000);
    });

    it('un monto inválido NO genera transacción (no mueve dinero)', async () => {
      const { result, addTransaction } = renderGuestDebts();

      await act(async () => {
        await result.current.registerDebtPayment('debt-1', -500);
      });

      expect(addTransaction).not.toHaveBeenCalled();
    });
  });

  describe('modifyDebtBalance', () => {
    it("control: 'add' con monto positivo SÍ aumenta el saldo (sanity check)", async () => {
      const { result } = renderGuestDebts();

      await act(async () => {
        await result.current.modifyDebtBalance('debt-1', 250, 'add');
      });

      expect(currentDebt(result).remainingAmount).toBe(1250);
      expect(currentDebt(result).originalAmount).toBe(1250);
    });

    it("'add' con monto NEGATIVO lanza y deja el saldo intacto (antes lo REDUCÍA)", async () => {
      const { result } = renderGuestDebts();

      await expect(
        act(async () => {
          await result.current.modifyDebtBalance('debt-1', -500, 'add');
        })
      ).rejects.toThrow('El monto debe ser mayor a cero');

      expect(currentDebt(result).remainingAmount).toBe(1000);
      expect(currentDebt(result).originalAmount).toBe(1000);
    });

    it("'subtract' con monto CERO lanza y deja el saldo intacto", async () => {
      const { result } = renderGuestDebts();

      await expect(
        act(async () => {
          await result.current.modifyDebtBalance('debt-1', 0, 'subtract');
        })
      ).rejects.toThrow('El monto debe ser mayor a cero');

      expect(currentDebt(result).remainingAmount).toBe(1000);
    });

    it('un monto NaN lanza y deja el saldo intacto', async () => {
      const { result } = renderGuestDebts();

      await expect(
        act(async () => {
          await result.current.modifyDebtBalance('debt-1', Number.NaN, 'add');
        })
      ).rejects.toThrow('El monto debe ser mayor a cero');

      expect(currentDebt(result).remainingAmount).toBe(1000);
    });
  });
});

const SAVINGS: Account = {
  id: 'savings',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 1_000,
};

const guestTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-existing',
  type: 'expense',
  amount: 100,
  category: 'Prueba',
  description: 'Movimiento existente',
  date: new Date('2026-08-24T12:00:00-05:00'),
  paid: true,
  accountId: SAVINGS.id!,
  ...overrides,
});

const renderGuestLedgerDebts = (
  seed: Debt[] = [],
  transactions: Transaction[] = []
) => {
  seedLedger(seed, [SAVINGS], transactions);
  const addTransaction = vi.fn<
    (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>
  >(async () => undefined);
  const rendered = renderHook(() => useDebts(null, transactions, undefined, {
    addTransaction,
    accounts: [SAVINGS],
  }));
  return { ...rendered, addTransaction };
};

describe('debt ledger source-funds guard in guest mode', () => {
  it('rejects lent origination that would overdraw savings before any local write', async () => {
    const { result, addTransaction } = renderGuestLedgerDebts();

    await expect(act(async () => {
      await result.current.addDebt({
        personName: 'Ana',
        type: 'lent',
        originalAmount: 1_000.01,
        remainingAmount: 1_000.01,
        accountId: SAVINGS.id,
        isSettled: false,
      });
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    expect(addTransaction).not.toHaveBeenCalled();
    expect(result.current.debts).toEqual([]);
  });

  it('allows exact lent origination and reaches zero', async () => {
    const { result } = renderGuestLedgerDebts();

    await act(async () => {
      await result.current.addDebt({
        personName: 'Ana',
        type: 'lent',
        originalAmount: 1_000,
        remainingAmount: 1_000,
        accountId: SAVINGS.id,
        isSettled: false,
      });
    });

    expect(readGuestLedgerEnvelope().data.transactions[0]).toEqual(expect.objectContaining({
      type: 'expense',
      amount: 1_000,
      accountId: 'savings',
    }));
    expect(result.current.debts).toHaveLength(1);
  });

  it('rejects borrowed repayment that would overdraw savings and preserves the debt', async () => {
    const debt: Debt = {
      ...SEED_DEBT,
      type: 'borrowed',
      accountId: SAVINGS.id,
      originalAmount: 1_000.01,
      remainingAmount: 1_000.01,
    };
    const { result, addTransaction } = renderGuestLedgerDebts([debt]);

    await expect(act(async () => {
      await result.current.registerDebtPayment(debt.id!, 1_000.01);
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    expect(addTransaction).not.toHaveBeenCalled();
    expect(result.current.debts[0].remainingAmount).toBe(1_000.01);
  });

  it('rejects worsening a historical negative and allows an improving origination', async () => {
    const history = [guestTransaction({ amount: 1_100 })];
    const worsening = renderGuestLedgerDebts([], history);

    await expect(act(async () => {
      await worsening.result.current.addDebt({
        personName: 'Ana',
        type: 'lent',
        originalAmount: 1,
        remainingAmount: 1,
        accountId: SAVINGS.id,
        isSettled: false,
      });
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    const improving = renderGuestLedgerDebts([], history);
    await act(async () => {
      await improving.result.current.addDebt({
        personName: 'Ana',
        type: 'borrowed',
        originalAmount: 50,
        remainingAmount: 50,
        accountId: SAVINGS.id,
        isSettled: false,
      });
    });

    expect(readGuestLedgerEnvelope().data.transactions[0]).toEqual(expect.objectContaining({
      type: 'income',
      amount: 50,
    }));
  });
});
