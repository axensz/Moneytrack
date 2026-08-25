import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../../types/finance';
import type { PaymentInstrument } from '../../types/transactionImport';

const H = vi.hoisted(() => ({
  instruments: [] as PaymentInstrument[],
  loading: false,
  error: null as Error | null,
  createInstrument: vi.fn(async () => undefined),
  updateInstrument: vi.fn(async () => undefined),
  setInstrumentActive: vi.fn(async () => undefined),
  deleteInstrument: vi.fn(async () => undefined),
}));

vi.mock('../../hooks/firestore/usePaymentInstruments', () => ({
  usePaymentInstruments: () => H,
}));

import { PaymentInstrumentsSection } from '../../components/views/accounts/components/PaymentInstrumentsSection';

const accounts: Account[] = [
  {
    id: 'savings',
    name: 'Cuenta principal',
    type: 'savings',
    isDefault: true,
    initialBalance: 0,
  },
  {
    id: 'card',
    name: 'Visa crédito',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    creditLimit: 2_000_000,
    usedCredit: 0,
  },
];

const instrument: PaymentInstrument = {
  id: 'instrument-1',
  schemaVersion: 1,
  label: 'Visa celular',
  accountId: 'card',
  kind: 'wallet-token',
  last4: '1234',
  network: 'visa',
  active: true,
  createdAt: new Date('2026-08-01T12:00:00.000Z'),
  updatedAt: new Date('2026-08-01T12:00:00.000Z'),
};

beforeEach(() => {
  H.instruments = [];
  H.loading = false;
  H.error = null;
  vi.clearAllMocks();
});

describe('PaymentInstrumentsSection', () => {
  it('keeps guest mode unchanged and guides an authenticated empty state', () => {
    const { rerender } = render(
      <PaymentInstrumentsSection userId={null} accounts={accounts} />,
    );
    expect(screen.queryByText('Medios de pago del celular')).not.toBeInTheDocument();

    rerender(<PaymentInstrumentsSection userId="owner" accounts={accounts} />);
    expect(screen.getByRole('heading', {
      name: 'Medios de pago del celular',
    })).toBeInTheDocument();
    expect(screen.getByText(/aún no has vinculado/i)).toBeInTheDocument();
  });

  it('validates four digits and creates an exact linked instrument', async () => {
    render(<PaymentInstrumentsSection userId="owner" accounts={accounts} />);
    const trigger = screen.getByRole('button', { name: 'Añadir medio' });
    expect(trigger).toHaveClass('min-h-[44px]');
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', {
      name: 'Añadir medio de pago',
    })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Mastercard celular' },
    });
    fireEvent.change(screen.getByLabelText('Cuenta vinculada'), {
      target: { value: 'savings' },
    });
    fireEvent.change(screen.getByLabelText('Últimos 4 dígitos'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar medio' }));
    expect(screen.getByRole('alert')).toHaveTextContent('exactamente 4 dígitos');
    expect(H.createInstrument).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Últimos 4 dígitos'), {
      target: { value: '9876' },
    });
    fireEvent.change(screen.getByLabelText('Red'), {
      target: { value: 'mastercard' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar medio' }));

    await waitFor(() => expect(H.createInstrument).toHaveBeenCalledWith({
      label: 'Mastercard celular',
      accountId: 'savings',
      kind: 'wallet-token',
      last4: '9876',
      network: 'mastercard',
    }));
  });

  it('shows the account label and supports edit and active-state changes', async () => {
    H.instruments = [instrument];
    render(<PaymentInstrumentsSection userId="owner" accounts={accounts} />);

    expect(screen.getByText('Visa crédito')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar Visa celular' }));
    await waitFor(() => expect(H.setInstrumentActive).toHaveBeenCalledWith(
      'instrument-1',
      false,
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Editar Visa celular' }));
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Visa del teléfono' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(H.updateInstrument).toHaveBeenCalledWith(
      'instrument-1',
      {
        label: 'Visa del teléfono',
        accountId: 'card',
        kind: 'wallet-token',
        last4: '1234',
        network: 'visa',
      },
    ));
  });

  it('requires an accessible confirmation before deletion', async () => {
    H.instruments = [instrument];
    render(<PaymentInstrumentsSection userId="owner" accounts={accounts} />);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Visa celular' }));
    expect(screen.getByRole('dialog', {
      name: 'Eliminar medio de pago',
    })).toBeInTheDocument();
    expect(H.deleteInstrument).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar medio' }));
    await waitFor(() => expect(H.deleteInstrument).toHaveBeenCalledWith(
      'instrument-1',
    ));
  });

  it('closes by keyboard and returns focus to the opening control', async () => {
    render(<PaymentInstrumentsSection userId="owner" accounts={accounts} />);
    const trigger = screen.getByRole('button', { name: 'Añadir medio' });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
