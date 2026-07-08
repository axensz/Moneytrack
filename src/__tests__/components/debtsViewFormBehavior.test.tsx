import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Debt } from '../../types/finance';

const mocks = vi.hoisted(() => ({
  addDebt: vi.fn(),
  updateDebt: vi.fn(),
  deleteDebt: vi.fn(),
  registerDebtPayment: vi.fn(),
  modifyDebtBalance: vi.fn(),
  forgiveDebt: vi.fn(),
  debts: [] as Debt[],
}));

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useDebtsDomain: () => ({
    debts: mocks.debts,
    addDebt: mocks.addDebt,
    updateDebt: mocks.updateDebt,
    deleteDebt: mocks.deleteDebt,
    registerDebtPayment: mocks.registerDebtPayment,
    modifyDebtBalance: mocks.modifyDebtBalance,
    forgiveDebt: mocks.forgiveDebt,
    debtStats: { totalLent: 0, totalBorrowed: 0, activeLentCount: 0, activeBorrowedCount: 0, settledCount: 0 },
  }),
  useAccountDomain: () => ({
    accounts: [],
  }),
}));

vi.mock('../../contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: false }),
}));

vi.mock('../../utils/toastHelpers', () => ({
  showToast: { error: vi.fn(), success: vi.fn() },
}));

import { DebtsView } from '../../components/views/debts/DebtsView';

describe('DebtsView - formulario nuevo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.debts = [];
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
});
