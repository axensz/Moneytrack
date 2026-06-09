import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAccountForm } from '../../components/views/accounts/hooks/useAccountForm';
import { unformatNumber } from '../../utils/formatters';
import type { Account, Transaction } from '../../types/finance';

const savings: Account = {
  id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0,
};

function setup(currentBalance: number, balancesReady = true) {
  const addTransaction = vi.fn(async (_tx: Omit<Transaction, 'id'>) => {});
  const updateAccount = vi.fn(async () => {});
  const hook = renderHook(() =>
    useAccountForm({
      addAccount: vi.fn(async () => {}),
      updateAccount,
      addTransaction,
      getAccountBalance: () => currentBalance,
      getCreditUsed: () => 0,
      formatCurrency: (n) => `$${n}`,
      balancesReady,
    })
  );
  return { ...hook, addTransaction, updateAccount };
}

describe('useAccountForm — ajuste de saldo (repro del reporte)', () => {
  it('saldo 603088.11 → nuevo 563088.89 crea ajuste de gasto 39999.22 (no más)', async () => {
    const { result, addTransaction } = setup(603088.11);
    act(() => result.current.openEditForm(savings));
    // El input guarda el valor unformateado (coma decimal, sin miles).
    act(() => result.current.setBalanceAdjustment('563088,89'));
    await act(async () => { await result.current.handleSubmit(); });

    expect(addTransaction).toHaveBeenCalledTimes(1);
    const tx = addTransaction.mock.calls[0][0];
    expect(tx.type).toBe('expense');
    expect(tx.amount).toBeCloseTo(39999.22, 2);
  });

  it('input con PUNTO decimal "563088.89" NO infla el ajuste (path real vía unformatNumber)', async () => {
    const { result, addTransaction } = setup(603088.11);
    act(() => result.current.openEditForm(savings));
    // Simula el onChange real del campo: guarda unformatNumber(valor tecleado).
    act(() => result.current.setBalanceAdjustment(unformatNumber('563088.89')));
    await act(async () => { await result.current.handleSubmit(); });
    const tx = addTransaction.mock.calls[0]?.[0];
    expect(tx?.type).toBe('expense');
    expect(tx?.amount).toBeCloseTo(39999.22, 2);
  });

  it('con saldos NO asentados (balancesReady=false) el ajuste se BLOQUEA: no escribe nada', async () => {
    const { result, addTransaction, updateAccount } = setup(603088.11, false);
    act(() => result.current.openEditForm(savings));
    act(() => result.current.setBalanceAdjustment('563088,89'));
    await act(async () => { await result.current.handleSubmit(); });

    // Ni transacción de ajuste ni update de cuenta: el delta saldría de un
    // saldo de ventana transitorio y persistiría un ajuste mal dimensionado.
    expect(addTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it('con saldos NO asentados pero SIN tocar el campo de ajuste, editar nombre sí funciona', async () => {
    const { result, addTransaction, updateAccount } = setup(603088.11, false);
    act(() => result.current.openEditForm(savings));
    await act(async () => { await result.current.handleSubmit(); });

    expect(updateAccount).toHaveBeenCalledTimes(1);
    expect(addTransaction).not.toHaveBeenCalled();
  });

  it('input con MILES "563.088" se interpreta como 563088 (no decimal)', async () => {
    const { result, addTransaction } = setup(603088.11);
    act(() => result.current.openEditForm(savings));
    act(() => result.current.setBalanceAdjustment(unformatNumber('563.088')));
    await act(async () => { await result.current.handleSubmit(); });
    const tx = addTransaction.mock.calls[0]?.[0];
    // 563088 - 603088.11 = -40000.11 → gasto.
    expect(tx?.amount).toBeCloseTo(40000.11, 2);
  });
});
