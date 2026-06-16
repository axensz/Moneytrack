/**
 * useAccountForm — guard de doble submit (#accounts-2).
 *
 * Al EDITAR una cuenta, closeForm() corre después de `await updateAccount` y
 * `await addTransaction`, así que un doble clic en "Actualizar" creaba DOS
 * transacciones de ajuste de saldo. El ref síncrono bloquea la segunda entrada.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Account } from '../../types/finance';

vi.mock('../../utils/toastHelpers', () => ({
  showToast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { useAccountForm } from '../../components/views/accounts/hooks/useAccountForm';

const savings: Account = { id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 };

const makeParams = () => ({
  addAccount: vi.fn(async () => {}),
  updateAccount: vi.fn(async () => {}),
  addTransaction: vi.fn(async () => {}),
  getAccountBalance: vi.fn(() => 100_000), // saldo actual 100k
  getCreditUsed: vi.fn(() => 0),
  formatCurrency: (n: number) => `$${n}`,
  balancesReady: true,
});

beforeEach(() => vi.clearAllMocks());

describe('useAccountForm — doble submit (#accounts-2)', () => {
  it('un doble clic en Actualizar crea UNA sola transacción de ajuste', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAccountForm(params));

    act(() => result.current.openEditForm(savings));
    act(() => result.current.setBalanceAdjustment('150000')); // ajuste +50k

    await act(async () => {
      const p1 = result.current.handleSubmit();
      const p2 = result.current.handleSubmit(); // segundo clic, mismo tick
      await Promise.all([p1, p2]);
    });

    expect(params.updateAccount).toHaveBeenCalledTimes(1);
    expect(params.addTransaction).toHaveBeenCalledTimes(1); // NO dos ajustes
  });
});
