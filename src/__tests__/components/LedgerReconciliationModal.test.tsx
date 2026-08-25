import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { Account, Transaction } from '../../types/finance';
import { buildLedgerReconciliationReport } from '../../utils/ledgerReconciliation';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  hideBalances: false,
  refresh: vi.fn(),
  executePlan: vi.fn(),
}));

vi.mock('../../hooks/useLedgerReconciliation', () => ({
  useLedgerReconciliation: () => mocks.state,
}));

vi.mock('../../contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances: mocks.hideBalances }),
}));

import { LedgerReconciliationModal } from '../../components/modals/LedgerReconciliationModal';

const account: Account = {
  id: 'account-1',
  name: 'Cuenta principal',
  type: 'savings',
  isDefault: true,
  initialBalance: 10,
};

const expense: Transaction = {
  id: 'expense',
  type: 'expense',
  amount: 20,
  category: 'Otros',
  description: 'Compra',
  date: new Date('2026-08-24T12:00:00.000Z'),
  paid: true,
  accountId: 'account-1',
};

const negativeReport = buildLedgerReconciliationReport({
  source: 'server',
  complete: true,
  accounts: [account],
  transactions: [expense],
  transactionIssues: [],
  debts: [],
  recurringPayments: [],
});

const readyState = () => ({
  report: negativeReport,
  transactions: [expense],
  status: 'ready',
  refreshing: false,
  executing: false,
  error: null,
  refresh: mocks.refresh,
  executePlan: mocks.executePlan,
});

beforeEach(() => {
  mocks.hideBalances = false;
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  mocks.executePlan.mockReset().mockResolvedValue(negativeReport);
  mocks.state = readyState();
});

describe('LedgerReconciliationModal', () => {
  it('muestra ecuación, clasificación y contratos responsive/semánticos', () => {
    render(
      <LedgerReconciliationModal isOpen onClose={() => {}} userId="user-1" />,
    );

    expect(screen.getByRole('dialog', { name: 'Integridad del libro' })).toBeInTheDocument();
    expect(screen.getAllByText('Negativo explicado').some(element => (
      element.classList.contains('text-warning')
    ))).toBe(true);
    expect(screen.getByText('Cuenta principal')).toBeInTheDocument();
    expect(screen.getByTestId('account-equation-account-1')).toHaveTextContent('$');
    expect(screen.getByTestId('ledger-account-grid')).toHaveClass(
      'grid-cols-1',
      'xl:grid-cols-2',
    );
    expect(screen.getByRole('button', { name: /actualizar conciliación/i }))
      .toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: /preparar ajuste a cero/i }))
      .toHaveClass('min-h-11');
  });

  it('oculta importes en cuentas, cruces y evidencia del plan', () => {
    mocks.hideBalances = true;
    render(
      <LedgerReconciliationModal isOpen onClose={() => {}} userId="user-1" />,
    );

    expect(screen.getAllByText('••••••').length).toBeGreaterThan(2);
    expect(screen.getByTestId('account-equation-account-1')).not.toHaveTextContent('$');
    fireEvent.click(screen.getByRole('button', { name: /preparar ajuste a cero/i }));
    expect(screen.getByTestId('repair-before')).toHaveTextContent('••••••');
    expect(screen.getByTestId('repair-after')).toHaveTextContent('••••••');
  });

  it('explica por qué un invitado no puede ejecutar reparaciones', () => {
    mocks.state = {
      report: null,
      transactions: [],
      status: 'guest',
      refreshing: false,
      executing: false,
      error: null,
      refresh: mocks.refresh,
      executePlan: mocks.executePlan,
    };
    render(
      <LedgerReconciliationModal isOpen onClose={() => {}} userId={null} />,
    );

    expect(screen.getByText(/inicia sesión para conciliar/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aplicar plan/i })).not.toBeInTheDocument();
  });

  it('requiere la frase exacta y nunca ejecuta al preparar o abrir', async () => {
    render(
      <LedgerReconciliationModal isOpen onClose={() => {}} userId="user-1" />,
    );
    expect(mocks.executePlan).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /preparar ajuste a cero/i }));
    expect(mocks.executePlan).not.toHaveBeenCalled();
    const phrase = screen.getByTestId('confirmation-phrase').textContent ?? '';
    const confirmation = screen.getByLabelText('Confirmación exacta');
    const apply = screen.getByRole('button', { name: /aplicar plan/i });

    fireEvent.change(confirmation, { target: { value: 'incorrecta' } });
    expect(apply).toBeDisabled();
    fireEvent.change(confirmation, { target: { value: phrase } });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);

    await waitFor(() => expect(mocks.executePlan).toHaveBeenCalledTimes(1));
    expect(mocks.executePlan.mock.calls[0][1]).toBe(phrase);
  });

  it('restaura el foco al control que abrió el modal', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Abrir integridad</button>
          <LedgerReconciliationModal
            isOpen={open}
            onClose={() => setOpen(false)}
            userId="user-1"
          />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Abrir integridad' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Integridad del libro' }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
