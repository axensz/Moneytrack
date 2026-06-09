/**
 * A1 — Ejecuta el CÓDIGO REAL de modifyDebtBalance (useDebts), no una copia.
 *
 * Antes este archivo re-implementaba `modifyDebtBalance` standalone dentro del
 * test, así que la función de producción nunca corría. Ahora rendereamos el hook
 * real en modo invitado (userId=null → todas las mutaciones pasan por
 * setLocalDebts, sin Firestore) y observamos result.current.debts tras cada
 * operación. Audit A1.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebts } from '../../hooks/useDebts';
import type { Debt } from '../../types/finance';

const seedDebts = (debts: Partial<Debt>[]) =>
  localStorage.setItem('debts', JSON.stringify(debts));

const makeDebt = (o: Partial<Debt> = {}): Partial<Debt> => ({
  id: 'd1',
  personName: 'Juan',
  type: 'lent',
  originalAmount: 1000,
  remainingAmount: 1000,
  isSettled: false,
  createdAt: new Date('2026-01-01').toISOString() as unknown as Date,
  ...o,
});

const renderDebts = () =>
  renderHook(() => useDebts(null, [], undefined, {})).result;

beforeEach(() => {
  localStorage.clear();
});

describe('modifyDebtBalance (código real de useDebts) — A1', () => {
  describe('add', () => {
    it('aumenta original y remaining', async () => {
      seedDebts([makeDebt({ originalAmount: 1000, remainingAmount: 1000 })]);
      const result = renderDebts();

      await act(async () => {
        await result.current.modifyDebtBalance('d1', 500, 'add');
      });

      expect(result.current.debts[0].originalAmount).toBe(1500);
      expect(result.current.debts[0].remainingAmount).toBe(1500);
      expect(result.current.debts[0].isSettled).toBe(false);
    });

    it('funciona con deuda parcialmente pagada', async () => {
      seedDebts([makeDebt({ originalAmount: 1000, remainingAmount: 600 })]);
      const result = renderDebts();

      await act(async () => {
        await result.current.modifyDebtBalance('d1', 400, 'add');
      });

      expect(result.current.debts[0].originalAmount).toBe(1400);
      expect(result.current.debts[0].remainingAmount).toBe(1000);
    });
  });

  describe('subtract', () => {
    it('reduce original y remaining', async () => {
      seedDebts([makeDebt({ originalAmount: 1000, remainingAmount: 1000 })]);
      const result = renderDebts();

      await act(async () => {
        await result.current.modifyDebtBalance('d1', 300, 'subtract');
      });

      expect(result.current.debts[0].originalAmount).toBe(700);
      expect(result.current.debts[0].remainingAmount).toBe(700);
    });

    it('salda la deuda cuando remaining llega a 0', async () => {
      seedDebts([makeDebt({ originalAmount: 1000, remainingAmount: 500 })]);
      const result = renderDebts();

      await act(async () => {
        await result.current.modifyDebtBalance('d1', 500, 'subtract');
      });

      expect(result.current.debts[0].remainingAmount).toBe(0);
      expect(result.current.debts[0].isSettled).toBe(true);
      expect(result.current.debts[0].settledAt).toBeTruthy();
    });

    it('lanza al restar más que el saldo pendiente', async () => {
      seedDebts([makeDebt({ remainingAmount: 500 })]);
      const result = renderDebts();

      await expect(
        act(async () => {
          await result.current.modifyDebtBalance('d1', 600, 'subtract');
        })
      ).rejects.toThrow(/no puedes restar más del saldo pendiente/i);

      // El saldo no cambió.
      expect(result.current.debts[0].remainingAmount).toBe(500);
    });
  });

  describe('validaciones', () => {
    it('lanza al modificar una deuda ya saldada', async () => {
      seedDebts([makeDebt({ isSettled: true, remainingAmount: 0 })]);
      const result = renderDebts();

      await expect(
        act(async () => {
          await result.current.modifyDebtBalance('d1', 100, 'add');
        })
      ).rejects.toThrow(/ya saldado/i);
    });

    it('lanza si la deuda no existe', async () => {
      seedDebts([makeDebt()]);
      const result = renderDebts();

      await expect(
        act(async () => {
          await result.current.modifyDebtBalance('no-existe', 100, 'add');
        })
      ).rejects.toThrow(/no encontrado/i);
    });
  });
});
