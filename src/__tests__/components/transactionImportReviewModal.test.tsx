import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../../types/finance';
import type {
  PaymentInstrument,
  PendingTransactionImportCandidate,
} from '../../types/transactionImport';
import type { ReviewedTransactionImportExpense } from '../../hooks/firestore/transactionImportOrchestration';

const C = vi.hoisted(() => ({
  confirm: vi.fn(async () => ({ id: 'transaction-1' })),
}));

vi.mock('../../hooks/firestore/transactionImportOrchestration', () => ({
  confirmTransactionImport: C.confirm,
}));

import { TransactionImportReviewModal } from '../../components/views/transactions/components/TransactionImportReviewModal';

const candidate: PendingTransactionImportCandidate = {
  id: 'a'.repeat(64),
  schemaVersion: 1,
  source: 'android-notification',
  sourcePackage: 'com.example.bank',
  occurredAt: new Date('2026-08-25T13:00:00.000Z'),
  amountMinor: 12_345,
  currency: 'COP',
  merchant: 'Comercio original',
  cardLast4: '1234',
  parserId: 'strict-cop-purchase',
  parserVersion: 1,
  confidence: 'high',
  status: 'pending',
};

const accounts: Account[] = [
  {
    id: 'savings',
    name: 'Ahorros',
    type: 'savings',
    isDefault: true,
    initialBalance: 1_000_000,
  },
  {
    id: 'card',
    name: 'Visa crédito',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    creditLimit: 2_000_000,
    usedCredit: 0,
    interestRate: 24,
  },
];

const instrument = (
  id = 'instrument-1',
  accountId = 'card',
): PaymentInstrument => ({
  id,
  schemaVersion: 1,
  label: `Visa celular ${id}`,
  accountId,
  kind: 'wallet-token',
  last4: '1234',
  network: 'visa',
  active: true,
  createdAt: new Date('2026-08-01T12:00:00.000Z'),
  updatedAt: new Date('2026-08-01T12:00:00.000Z'),
});

const renderModal = ({
  instruments = [instrument()],
  isOnline = true,
  currentCandidate = candidate,
  onClose = vi.fn(),
  onConfirmed = vi.fn(),
}: {
  instruments?: PaymentInstrument[];
  isOnline?: boolean;
  currentCandidate?: PendingTransactionImportCandidate;
  onClose?: () => void;
  onConfirmed?: () => void;
} = {}) => ({
  onClose,
  onConfirmed,
  ...render(
    <TransactionImportReviewModal
      isOpen
      userId="owner"
      candidate={currentCandidate}
      accounts={accounts}
      expenseCategories={['Alimentación', 'Transporte']}
      instruments={instruments}
      isOnline={isOnline}
      onClose={onClose}
      onConfirmed={onConfirmed}
    />,
  ),
});

beforeEach(() => {
  vi.clearAllMocks();
  C.confirm.mockResolvedValue({ id: 'transaction-1' });
});

describe('TransactionImportReviewModal', () => {
  it('preselects an exact account without exposing the instrument alias', () => {
    const { rerender } = renderModal();
    expect(screen.getByLabelText('Cuenta')).toHaveValue('card');
    expect(screen.queryByText(/sugerida por Visa celular instrument-1/i)).not.toBeInTheDocument();

    rerender(
      <TransactionImportReviewModal
        isOpen
        userId="owner"
        candidate={candidate}
        accounts={accounts}
        expenseCategories={['Alimentación']}
        instruments={[instrument(), instrument('instrument-2', 'savings')]}
        isOnline
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Cuenta')).toHaveValue('');
    expect(screen.getByText(/más de un medio activo coincide/i)).toBeInTheDocument();

    rerender(
      <TransactionImportReviewModal
        isOpen
        userId="owner"
        candidate={candidate}
        accounts={accounts}
        expenseCategories={['Alimentación']}
        instruments={[]}
        isOnline
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );
    expect(screen.getByText(/elige la cuenta que realmente pagó/i)).toBeInTheDocument();
  });

  it('requires an account and an expense category', () => {
    renderModal({ instruments: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar gasto' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/cuenta/i);

    fireEvent.change(screen.getByLabelText('Cuenta'), {
      target: { value: 'savings' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar gasto' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/categoría/i);
    expect(C.confirm).not.toHaveBeenCalled();
  });

  it('submits corrected amount, merchant, date and credit details to the canonical writer', async () => {
    const callbacks = renderModal();
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Transporte' },
    });
    fireEvent.change(screen.getByLabelText('Monto'), {
      target: { value: '98.765,43' },
    });
    fireEvent.change(screen.getByLabelText('Comercio'), {
      target: { value: 'Comercio corregido' },
    });
    fireEvent.change(screen.getByLabelText('Fecha'), {
      target: { value: '2026-08-24' },
    });
    fireEvent.change(screen.getByLabelText('Cuotas'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByLabelText('Esta compra genera interés'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar gasto' }));

    await waitFor(() => expect(C.confirm).toHaveBeenCalledTimes(1));
    const [userId, candidateId, expense] = C.confirm.mock.calls[0] as unknown as [
      string,
      string,
      ReviewedTransactionImportExpense,
    ];
    expect(userId).toBe('owner');
    expect(candidateId).toBe(candidate.id);
    expect(expense).toEqual(expect.objectContaining({
      expectedCandidate: candidate,
      accountId: 'card',
      category: 'Transporte',
      amount: 98_765.43,
      merchant: 'Comercio corregido',
      occurredAt: expect.any(Date),
      installments: 3,
      hasInterest: true,
      paymentInstrumentId: 'instrument-1',
      rememberInstrument: false,
    }));
    expect(callbacks.onConfirmed).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the normalized captured amount visible and submits its numeric value', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Cuenta'), {
      target: { value: 'card' },
    });
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Transporte' },
    });
    fireEvent.change(screen.getByLabelText('Monto'), {
      target: { value: '12.345,22sasasa' },
    });
    expect(screen.getByLabelText('Monto')).toHaveValue('12.345,22');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar gasto' }));
    await waitFor(() => expect(C.confirm).toHaveBeenCalledTimes(1));
    const [, , expense] = C.confirm.mock.calls[0] as unknown as [
      string,
      string,
      ReviewedTransactionImportExpense,
    ];
    expect(expense).toEqual(expect.objectContaining({
      amount: 12_345.22,
      accountId: 'card',
      paymentInstrumentId: 'instrument-1',
    }));
  });

  it('offers remembering only when last4 exists and no active instrument matches', () => {
    const { rerender } = renderModal({ instruments: [] });
    expect(screen.getByLabelText('Recordar este medio de pago')).toBeInTheDocument();

    rerender(
      <TransactionImportReviewModal
        isOpen
        userId="owner"
        candidate={{ ...candidate, cardLast4: undefined }}
        accounts={accounts}
        expenseCategories={['Alimentación']}
        instruments={[]}
        isOnline
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Recordar este medio de pago')).not.toBeInTheDocument();
  });

  it('blocks financial confirmation offline while preserving the reviewed form', () => {
    renderModal({ isOnline: false });
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Alimentación' },
    });
    fireEvent.change(screen.getByLabelText('Comercio'), {
      target: { value: 'Edición sin red' },
    });

    expect(screen.getByText(/conéctate para confirmar/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar gasto' })).toBeDisabled();
    expect(screen.getByLabelText('Comercio')).toHaveValue('Edición sin red');
    expect(C.confirm).not.toHaveBeenCalled();
  });

  it('keeps server failures and the edited values visible for repair', async () => {
    C.confirm.mockRejectedValueOnce(new Error('La cuenta cambió en el servidor.'));
    renderModal();
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Alimentación' },
    });
    fireEvent.change(screen.getByLabelText('Comercio'), {
      target: { value: 'Valor preservado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar gasto' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      'La cuenta cambió en el servidor.',
    ));
    expect(screen.getByLabelText('Comercio')).toHaveValue('Valor preservado');
  });

  it('guards the canonical confirmation against a double submit', async () => {
    let release!: () => void;
    const pending = new Promise<{ id: string }>(resolve => {
      release = () => resolve({ id: 'transaction-1' });
    });
    C.confirm.mockImplementationOnce(async () => pending);
    renderModal();
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Alimentación' },
    });
    const submit = screen.getByRole('button', { name: 'Confirmar gasto' });

    await act(async () => {
      submit.click();
      submit.click();
      release();
      await pending;
    });
    expect(C.confirm).toHaveBeenCalledTimes(1);
  });
});
