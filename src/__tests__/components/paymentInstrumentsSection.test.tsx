import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../../types/finance';
import type { PaymentInstrument } from '../../types/transactionImport';

const H = vi.hoisted(() => ({
  instruments: [] as PaymentInstrument[],
  loading: false,
  error: null as Error | null,
  createInstrument: vi.fn(async (): Promise<void> => undefined),
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
  H.createInstrument.mockReset().mockResolvedValue(undefined);
  H.updateInstrument.mockReset().mockResolvedValue(undefined);
  H.setInstrumentActive.mockReset().mockResolvedValue(undefined);
  H.deleteInstrument.mockReset().mockResolvedValue(undefined);
});

interface ManagerOptions {
  userId?: string | null;
  accountId?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

const managerProps = ({
  userId = 'owner',
  accountId = 'card',
  isOpen = true,
  onClose = vi.fn(),
}: ManagerOptions = {}): React.ComponentProps<typeof PaymentInstrumentsSection> => ({
  userId,
  accounts,
  accountId,
  isOpen,
  onClose,
});

describe('PaymentInstrumentsSection', () => {
  it('keeps guest mode unchanged and guides an authenticated empty state', () => {
    const { rerender } = render(
      <PaymentInstrumentsSection {...managerProps({ userId: null })} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<PaymentInstrumentsSection {...managerProps()} />);
    expect(screen.getByRole('dialog', {
      name: 'Medios de pago · Visa crédito',
    })).toBeInTheDocument();
    expect(screen.getByText(/esta cuenta no tiene medios vinculados/i)).toBeInTheDocument();
  });

  it('validates four digits and creates an exact linked instrument', async () => {
    render(<PaymentInstrumentsSection {...managerProps()} />);
    const trigger = screen.getByRole('button', { name: 'Añadir medio' });
    expect(trigger).toHaveClass('min-h-[44px]');
    fireEvent.click(trigger);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', {
      name: 'Medios de pago · Visa crédito',
    })).toBeInTheDocument();
    expect(screen.getByRole('heading', {
      name: 'Añadir medio de pago',
    })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre o apodo'), {
      target: { value: 'Oro' },
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
    fireEvent.change(screen.getByLabelText('Últimos 4 dígitos'), {
      target: { value: '98ab765' },
    });
    expect(screen.getByLabelText('Últimos 4 dígitos')).toHaveValue('9876');
    expect(screen.getByText(/mismo apodo que ves en wallet/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Red'), {
      target: { value: 'mastercard' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar medio' }));

    await waitFor(() => expect(H.createInstrument).toHaveBeenCalledWith({
      label: 'Oro',
      accountId: 'savings',
      kind: 'wallet-token',
      last4: '9876',
      network: 'mastercard',
    }));
  });

  it('shows the account label and supports edit and active-state changes', async () => {
    H.instruments = [instrument];
    render(<PaymentInstrumentsSection {...managerProps()} />);

    expect(screen.getByRole('dialog', {
      name: 'Medios de pago · Visa crédito',
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar Visa celular' }));
    await waitFor(() => expect(H.setInstrumentActive).toHaveBeenCalledWith(
      'instrument-1',
      false,
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Editar Visa celular' }));
    expect(screen.getByRole('dialog', {
      name: 'Medios de pago · Visa crédito',
    })).toBeInTheDocument();
    expect(screen.getByRole('heading', {
      name: 'Editar medio de pago',
    })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre o apodo'), {
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

  it('uses one modal for the selected account and for its add form', () => {
    H.instruments = [
      instrument,
      {
        ...instrument,
        id: 'instrument-2',
        label: 'Débito celular',
        accountId: 'savings',
        last4: '5678',
      },
    ];
    render(<PaymentInstrumentsSection {...managerProps()} />);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByText('Visa celular')).toBeInTheDocument();
    expect(screen.queryByText('Débito celular')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Añadir medio' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByLabelText('Cuenta vinculada')).toHaveValue('card');
  });

  it('preserves an in-progress draft across parent rerenders', () => {
    const { rerender } = render(
      <PaymentInstrumentsSection {...managerProps()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Añadir medio' }));
    fireEvent.change(screen.getByLabelText('Nombre o apodo'), {
      target: { value: 'Oro del celular' },
    });
    fireEvent.change(screen.getByLabelText('Últimos 4 dígitos'), {
      target: { value: '9876' },
    });

    rerender(<PaymentInstrumentsSection {...managerProps()} />);

    expect(screen.getByLabelText('Nombre o apodo')).toHaveValue('Oro del celular');
    expect(screen.getByLabelText('Últimos 4 dígitos')).toHaveValue('9876');
  });

  it('preserves a pending save across rerenders and prevents duplicate submits', async () => {
    let resolveSave!: () => void;
    H.createInstrument.mockImplementationOnce(() => new Promise<void>(resolve => {
      resolveSave = resolve;
    }));
    const { rerender } = render(
      <PaymentInstrumentsSection {...managerProps()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Añadir medio' }));
    fireEvent.change(screen.getByLabelText('Nombre o apodo'), {
      target: { value: 'Oro' },
    });
    fireEvent.change(screen.getByLabelText('Últimos 4 dígitos'), {
      target: { value: '9876' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar medio' }));
    await waitFor(() => expect(H.createInstrument).toHaveBeenCalledTimes(1));

    rerender(<PaymentInstrumentsSection {...managerProps()} />);

    const savingButton = screen.getByRole('button', { name: 'Guardando…' });
    expect(savingButton).toBeDisabled();
    fireEvent.submit(savingButton.closest('form') as HTMLFormElement);
    expect(H.createInstrument).toHaveBeenCalledTimes(1);

    await act(async () => resolveSave());
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Añadir medio' }),
    ).toBeInTheDocument());
  });

  it('blocks every modal close control while a save is pending', async () => {
    let resolveSave!: () => void;
    H.createInstrument.mockImplementationOnce(() => new Promise<void>(resolve => {
      resolveSave = resolve;
    }));
    render(<PaymentInstrumentsSection {...managerProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir medio' }));
    fireEvent.change(screen.getByLabelText('Nombre o apodo'), {
      target: { value: 'Oro' },
    });
    fireEvent.change(screen.getByLabelText('Últimos 4 dígitos'), {
      target: { value: '9876' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar medio' }));
    await waitFor(() => expect(H.createInstrument).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByLabelText('Nombre o apodo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog', {
      name: 'Medios de pago · Visa crédito',
    }));
    expect(screen.getByLabelText('Nombre o apodo')).toBeInTheDocument();

    await act(async () => resolveSave());
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Añadir medio' }),
    ).toBeInTheDocument());
  });

  it('does not let an abandoned save clear a newer account form', async () => {
    let resolveSave!: () => void;
    H.createInstrument.mockImplementationOnce(() => new Promise<void>(resolve => {
      resolveSave = resolve;
    }));

    function Harness() {
      const [accountId, setAccountId] = useState('card');
      return (
        <>
          <button type="button" onClick={() => setAccountId('savings')}>
            Cambiar cuenta
          </button>
          <PaymentInstrumentsSection
            {...managerProps({ accountId })}
          />
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir medio' }));
    fireEvent.change(screen.getByLabelText('Nombre o apodo'), {
      target: { value: 'Medio anterior' },
    });
    fireEvent.change(screen.getByLabelText('Últimos 4 dígitos'), {
      target: { value: '1111' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar medio' }));
    await waitFor(() => expect(H.createInstrument).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar cuenta' }));
    expect(screen.getByRole('dialog', {
      name: 'Medios de pago · Cuenta principal',
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir medio' }));
    fireEvent.change(screen.getByLabelText('Nombre o apodo'), {
      target: { value: 'Medio nuevo' },
    });

    await act(async () => resolveSave());

    expect(screen.getByLabelText('Nombre o apodo')).toHaveValue('Medio nuevo');
  });

  it('does not surface an abandoned save error in a newer account context', async () => {
    let rejectSave!: (reason: Error) => void;
    H.createInstrument.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectSave = reject;
    }));

    function Harness() {
      const [accountId, setAccountId] = useState('card');
      return (
        <>
          <button type="button" onClick={() => setAccountId('savings')}>
            Cambiar cuenta
          </button>
          <PaymentInstrumentsSection {...managerProps({ accountId })} />
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir medio' }));
    fireEvent.change(screen.getByLabelText('Nombre o apodo'), {
      target: { value: 'Medio anterior' },
    });
    fireEvent.change(screen.getByLabelText('Últimos 4 dígitos'), {
      target: { value: '1111' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar medio' }));
    await waitFor(() => expect(H.createInstrument).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar cuenta' }));
    expect(screen.getByRole('dialog', {
      name: 'Medios de pago · Cuenta principal',
    })).toBeInTheDocument();

    await act(async () => rejectSave(new Error('Error de la cuenta anterior')));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Error de la cuenta anterior')).not.toBeInTheDocument();
  });

  it('returns focus to the add action after cancelling or saving the form', async () => {
    render(<PaymentInstrumentsSection {...managerProps()} />);
    const addButton = screen.getByRole('button', { name: 'Añadir medio' });

    fireEvent.click(addButton);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Añadir medio' }),
    ).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Añadir medio' }));
    fireEvent.change(screen.getByLabelText('Nombre o apodo'), {
      target: { value: 'Oro' },
    });
    fireEvent.change(screen.getByLabelText('Últimos 4 dígitos'), {
      target: { value: '9876' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar medio' }));

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Añadir medio' }),
    ).toHaveFocus());
  });

  it('returns focus to the edited instrument action after cancelling', async () => {
    H.instruments = [instrument];
    render(<PaymentInstrumentsSection {...managerProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar Visa celular' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Editar Visa celular' }),
    ).toHaveFocus());
  });

  it('returns focus to add when a saved edit leaves the selected account', async () => {
    H.instruments = [instrument];
    render(<PaymentInstrumentsSection {...managerProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar Visa celular' }));
    fireEvent.change(screen.getByLabelText('Cuenta vinculada'), {
      target: { value: 'savings' },
    });
    H.instruments = [{ ...instrument, accountId: 'savings' }];
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Añadir medio' }),
    ).toHaveFocus());
  });

  it('requires an accessible confirmation before deletion', async () => {
    H.instruments = [instrument];
    render(<PaymentInstrumentsSection {...managerProps()} />);

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
    function Harness() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>Abrir medios</button>
          <PaymentInstrumentsSection
            {...managerProps({ isOpen, onClose: () => setIsOpen(false) })}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Abrir medios' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Medios de pago · Visa crédito' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus());

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });
});
