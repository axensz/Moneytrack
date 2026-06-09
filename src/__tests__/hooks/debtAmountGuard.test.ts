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
import type { Debt, Transaction } from '../../types/finance';

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
  localStorage.setItem('debts', JSON.stringify([SEED_DEBT]));
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
