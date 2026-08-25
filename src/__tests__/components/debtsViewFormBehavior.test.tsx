import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Debt } from '../../types/finance';

const mocks = vi.hoisted(() => ({
  addDebt: vi.fn(),
  updateDebt: vi.fn(),
  deleteDebt: vi.fn(),
  reassignDebtAccount: vi.fn(),
  registerDebtPayment: vi.fn(),
  modifyDebtBalance: vi.fn(),
  forgiveDebt: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  debts: [] as Debt[],
  accounts: [] as Account[],
}));

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useDebtsDomain: () => ({
    debts: mocks.debts,
    addDebt: mocks.addDebt,
    updateDebt: mocks.updateDebt,
    deleteDebt: mocks.deleteDebt,
    reassignDebtAccount: mocks.reassignDebtAccount,
    registerDebtPayment: mocks.registerDebtPayment,
    modifyDebtBalance: mocks.modifyDebtBalance,
    forgiveDebt: mocks.forgiveDebt,
    debtStats: { totalLent: 0, totalBorrowed: 0, activeLentCount: 0, activeBorrowedCount: 0, settledCount: 0 },
  }),
  useAccountDomain: () => ({
    accounts: mocks.accounts,
  }),
}));

vi.mock('../../contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: false }),
}));

vi.mock('../../utils/toastHelpers', () => ({
  showToast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { DebtsView } from '../../components/views/debts/DebtsView';

describe('DebtsView - formulario nuevo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.debts = [];
    mocks.accounts = [];
  });

  it('descarta el borrador al cancelar una deuda nueva', () => {
    render(<DebtsView />);

    fireEvent.click(screen.getByRole('button', { name: /nuevo/i }));
    fireEvent.change(screen.getByPlaceholderText('Nombre de la persona'), { target: { value: 'Laura' } });
    fireEvent.change(screen.getByPlaceholderText('Monto'), { target: { value: '700000' } });
    fireEvent.change(screen.getByPlaceholderText(/Descripci/), { target: { value: 'Prueba' } });
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    fireEvent.click(screen.getByRole('button', { name: /nuevo/i }));

    expect(screen.getByPlaceholderText('Nombre de la persona')).toHaveValue('');
    expect(screen.getByPlaceholderText('Monto')).toHaveValue('');
    expect(screen.getByPlaceholderText(/Descripci/)).toHaveValue('');
  });

  it('usa un formulario nativo con etiquetas y errores asociados', () => {
    render(<DebtsView />);

    fireEvent.click(screen.getByRole('button', { name: /nuevo/i }));

    const form = screen.getByRole('form', { name: 'Registrar préstamo o deuda' });
    const personName = screen.getByRole('textbox', { name: 'Nombre de la persona' });
    const amount = screen.getByRole('textbox', { name: 'Monto' });
    expect(screen.getByLabelText('Descripción (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Fecha del préstamo/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Cuenta asociada/)).toBeInTheDocument();

    fireEvent.submit(form);

    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa el nombre de la persona');
    expect(personName).toHaveAttribute('aria-invalid', 'true');
    expect(personName).toHaveAttribute('aria-describedby', 'new-debt-person-error');
    expect(mocks.addDebt).not.toHaveBeenCalled();

    fireEvent.change(personName, { target: { value: 'Laura' } });
    fireEvent.submit(form);

    expect(screen.getByRole('alert')).toHaveTextContent('El monto debe ser mayor a 0');
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(amount).toHaveAttribute('aria-describedby', 'new-debt-amount-error');
    expect(mocks.addDebt).not.toHaveBeenCalled();
  });

  it('bloquea doble submit mientras se guarda una deuda', async () => {
    let release!: () => void;
    mocks.addDebt.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));

    render(<DebtsView />);

    fireEvent.click(screen.getByRole('button', { name: /nuevo/i }));
    fireEvent.change(screen.getByPlaceholderText('Nombre de la persona'), { target: { value: 'Laura' } });
    fireEvent.change(screen.getByPlaceholderText('Monto'), { target: { value: '700000' } });

    const submit = screen.getByRole('button', { name: /registrar/i });
    await act(async () => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });

    expect(mocks.addDebt).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });
  });

  it('mantiene el borrador y muestra el motivo cuando la cuenta no tiene saldo', async () => {
    mocks.addDebt.mockRejectedValueOnce(new Error('Saldo insuficiente. Disponible: $0'));

    render(<DebtsView />);

    fireEvent.click(screen.getByRole('button', { name: /nuevo/i }));
    fireEvent.change(screen.getByPlaceholderText('Nombre de la persona'), { target: { value: 'QA saldo insuficiente' } });
    fireEvent.change(screen.getByPlaceholderText('Monto'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar/i }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Saldo insuficiente. Disponible: $0');
    });
    expect(screen.getByPlaceholderText('Nombre de la persona')).toHaveValue('QA saldo insuficiente');
    expect(screen.getByRole('button', { name: /registrar/i })).toBeEnabled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('permite eliminar un préstamo saldado y explica la cascada', async () => {
    mocks.debts = [{
      id: 'settled-1',
      personName: 'Juan',
      type: 'lent',
      originalAmount: 500_000,
      remainingAmount: 0,
      isSettled: true,
      createdAt: new Date(),
    }];
    mocks.deleteDebt.mockResolvedValue(undefined);
    render(<DebtsView />);

    fireEvent.click(screen.getByRole('button', { name: /mostrar saldados/i }));
    fireEvent.click(screen.getByRole('button', { name: /eliminar préstamo saldado de juan/i }));

    expect(screen.getByRole('dialog')).toHaveTextContent(/transacciones vinculadas/i);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^eliminar$/i }));
    });

    expect(mocks.deleteDebt).toHaveBeenCalledWith('settled-1');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Eliminado');
  });

  it('mantiene la confirmación abierta y muestra el error si el borrado falla', async () => {
    mocks.debts = [{
      id: 'active-1',
      personName: 'Laura',
      type: 'lent',
      originalAmount: 500_000,
      remainingAmount: 500_000,
      isSettled: false,
      createdAt: new Date(),
    }];
    mocks.deleteDebt.mockRejectedValue(new Error('Firestore rechazó el borrado'));
    render(<DebtsView />);

    fireEvent.click(screen.getByRole('button', { name: /eliminar préstamo de laura/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^eliminar$/i }));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith('Firestore rechazó el borrado');
  });

  it('mantiene el formulario de pago abierto si guardar el pago falla', async () => {
    mocks.debts = [{
      id: 'active-1',
      personName: 'Laura',
      type: 'lent',
      originalAmount: 500_000,
      remainingAmount: 500_000,
      isSettled: false,
      createdAt: new Date(),
    }];
    mocks.registerDebtPayment.mockRejectedValue(new Error('No se pudo registrar el pago'));
    render(<DebtsView />);

    const openPayment = screen.getByRole('button', { name: /registrar pago de laura/i });
    expect(openPayment).toHaveClass('h-11', 'w-11');
    fireEvent.click(openPayment);
    fireEvent.change(screen.getByPlaceholderText('Monto del pago'), { target: { value: '100000' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^pagar$/i }));
    });

    expect(screen.getByPlaceholderText('Monto del pago')).toHaveValue('100.000');
    expect(mocks.toastError).toHaveBeenCalledWith('No se pudo registrar el pago');
  });

  it('mantiene abiertos condonación y próximo pago cuando sus escrituras fallan', async () => {
    mocks.debts = [{
      id: 'active-1',
      personName: 'Laura',
      type: 'lent',
      originalAmount: 500_000,
      remainingAmount: 500_000,
      isSettled: false,
      createdAt: new Date(),
    }];
    mocks.forgiveDebt.mockRejectedValue(new Error('No se pudo condonar'));
    mocks.updateDebt.mockRejectedValue(new Error('No se pudo actualizar la fecha'));
    render(<DebtsView />);

    fireEvent.click(screen.getByRole('button', { name: /condonar deuda de laura/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'No pagada' }));
    });
    expect(screen.getByRole('button', { name: 'No pagada' })).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith('No se pudo condonar');

    fireEvent.click(screen.getByRole('button', { name: /próximo pago de laura/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar fecha/i }));
    });
    expect(screen.getByRole('button', { name: /guardar fecha/i })).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith('No se pudo actualizar la fecha');
  });

  it('restaura el foco al botón que abrió la confirmación', async () => {
    mocks.debts = [{
      id: 'active-1',
      personName: 'Laura',
      type: 'lent',
      originalAmount: 500_000,
      remainingAmount: 500_000,
      isSettled: false,
      createdAt: new Date(),
    }];
    render(<DebtsView />);

    const opener = screen.getByRole('button', { name: /eliminar préstamo de laura/i });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('reasigna la cuenta desde una deuda activa y bloquea el doble submit', async () => {
    mocks.accounts = [
      { id: 'savings', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
      { id: 'credit', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, usedCredit: 0 },
    ];
    mocks.debts = [{
      id: 'active-1', personName: 'Laura', type: 'lent', originalAmount: 500_000,
      remainingAmount: 300_000, accountId: 'savings', isSettled: false, createdAt: new Date(),
    }];
    let release!: () => void;
    mocks.reassignDebtAccount.mockReturnValueOnce(new Promise<void>(resolve => { release = resolve; }));
    render(<DebtsView />);

    const accountOpener = screen.getByRole('button', { name: /cambiar cuenta de laura/i });
    expect(accountOpener).toHaveClass('h-11', 'w-11');
    fireEvent.click(accountOpener);
    expect(screen.getByRole('dialog')).toHaveTextContent(/pagos ya registrados conservarán/i);
    const select = screen.getByRole('combobox', { name: /cuenta asociada/i });
    expect(select).toHaveValue('savings');
    fireEvent.change(select, { target: { value: 'credit' } });
    const submit = screen.getByRole('button', { name: /guardar cuenta/i });

    await act(async () => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    expect(mocks.reassignDebtAccount).toHaveBeenCalledTimes(1);
    expect(mocks.reassignDebtAccount).toHaveBeenCalledWith('active-1', 'credit');

    await act(async () => release());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Cuenta asociada actualizada');
  });

  it('permite abrir la cuenta en saldados y conserva el diálogo si falla', async () => {
    mocks.accounts = [
      { id: 'savings', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
      { id: 'credit', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, usedCredit: 0 },
    ];
    mocks.debts = [{
      id: 'settled-1', personName: 'Juan', type: 'lent', originalAmount: 500_000,
      remainingAmount: 0, accountId: 'savings', isSettled: true, createdAt: new Date(),
    }];
    mocks.reassignDebtAccount.mockRejectedValue(new Error('El historial necesita revisión'));
    render(<DebtsView />);

    fireEvent.click(screen.getByRole('button', { name: /mostrar saldados/i }));
    const opener = screen.getByRole('button', { name: /cambiar cuenta del préstamo saldado de juan/i });
    expect(opener).toHaveClass('h-11', 'w-11');
    expect(screen.getByRole('button', { name: /eliminar préstamo saldado de juan/i })).toHaveClass('h-11', 'w-11');
    fireEvent.click(opener);
    fireEvent.change(screen.getByRole('combobox', { name: /cuenta asociada/i }), { target: { value: 'credit' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cuenta/i }));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /cuenta asociada/i })).toHaveValue('credit');
    expect(mocks.toastError).toHaveBeenCalledWith('El historial necesita revisión');
  });

  it('restaura el foco al cancelar el cambio de cuenta', async () => {
    mocks.accounts = [
      { id: 'savings', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
    ];
    mocks.debts = [{
      id: 'active-1', personName: 'Laura', type: 'lent', originalAmount: 500_000,
      remainingAmount: 300_000, accountId: 'savings', isSettled: false, createdAt: new Date(),
    }];
    render(<DebtsView />);

    const opener = screen.getByRole('button', { name: /cambiar cuenta de laura/i });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    await waitFor(() => expect(opener).toHaveFocus());
  });
});
