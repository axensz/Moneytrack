import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAccountForm } from '../../components/views/accounts/hooks/useAccountForm';
import type { AccountUpdateOptions } from '../../hooks/useAccounts';
import { unformatNumber } from '../../utils/formatters';
import type { Account } from '../../types/finance';

const savings: Account = {
  id: 'sav', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0,
};
const credit: Account = {
  id: 'tc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: 1_000_000,
};

function setup(currentBalance: number, balancesReady = true) {
  const updateAccount = vi.fn<(
    id: string,
    updates: Partial<Account>,
    options?: AccountUpdateOptions
  ) => Promise<void>>(async () => {});
  const hook = renderHook(() =>
    useAccountForm({
      addAccount: vi.fn(async () => {}),
      updateAccount,
      balancesReady,
    })
  );
  return { ...hook, updateAccount, currentBalance };
}

describe('useAccountForm — ajuste de saldo (repro del reporte)', () => {
  it('envía el saldo objetivo exacto con la edición y no crea una segunda fase', async () => {
    const { result, updateAccount } = setup(603088.11);
    act(() => result.current.openEditForm(savings));
    // El input guarda el valor unformateado (coma decimal, sin miles).
    act(() => result.current.setBalanceAdjustment('563088,89'));
    await act(async () => { await result.current.handleSubmit(); });

    expect(updateAccount).toHaveBeenCalledWith(
      'sav',
      expect.objectContaining({ name: 'Ahorros' }),
      { targetBalance: 563088.89 }
    );
  });

  it('input con PUNTO decimal "563088.89" NO infla el ajuste (path real vía unformatNumber)', async () => {
    const { result, updateAccount } = setup(603088.11);
    act(() => result.current.openEditForm(savings));
    // Simula el onChange real del campo: guarda unformatNumber(valor tecleado).
    act(() => result.current.setBalanceAdjustment(unformatNumber('563088.89')));
    await act(async () => { await result.current.handleSubmit(); });
    expect(updateAccount).toHaveBeenCalledWith(
      'sav',
      expect.any(Object),
      { targetBalance: 563088.89 }
    );
  });

  it('con saldos NO asentados (balancesReady=false) el ajuste se BLOQUEA: no escribe nada', async () => {
    const { result, updateAccount } = setup(603088.11, false);
    act(() => result.current.openEditForm(savings));
    act(() => result.current.setBalanceAdjustment('563088,89'));
    await act(async () => { await result.current.handleSubmit(); });

    // No actualiza la cuenta: el servidor todavía no puede ofrecer una
    // autoridad asentada al flujo de edición.
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it('con saldos NO asentados pero SIN tocar el campo de ajuste, editar nombre sí funciona', async () => {
    const { result, updateAccount } = setup(603088.11, false);
    act(() => result.current.openEditForm(savings));
    await act(async () => { await result.current.handleSubmit(); });

    expect(updateAccount).toHaveBeenCalledTimes(1);
  });

  it('input con MILES "563.088" se interpreta como 563088 (no decimal)', async () => {
    const { result, updateAccount } = setup(603088.11);
    act(() => result.current.openEditForm(savings));
    act(() => result.current.setBalanceAdjustment(unformatNumber('563.088')));
    await act(async () => { await result.current.handleSubmit(); });
    expect(updateAccount).toHaveBeenCalledWith(
      'sav',
      expect.any(Object),
      { targetBalance: 563088 }
    );
  });

  it('al editar una TC guarda día de corte y día de pago', async () => {
    const { result, updateAccount } = setup(0);
    act(() => result.current.openEditForm(credit));
    act(() => result.current.setNewAccount({
      ...result.current.newAccount,
      cutoffDay: 20,
      paymentDay: 8,
    }));
    await act(async () => { await result.current.handleSubmit(); });

    expect(updateAccount).toHaveBeenCalledWith('tc', expect.objectContaining({
      cutoffDay: 20,
      paymentDay: 8,
    }));
  });
});
