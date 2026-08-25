import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Categories } from '../../types/finance';
import type {
  PendingTransactionImportCandidate,
  PaymentInstrument,
} from '../../types/transactionImport';

const H = vi.hoisted(() => ({
  candidates: [] as PendingTransactionImportCandidate[],
  loading: false,
  error: null as Error | null,
  reachedLimit: false,
  dismissCandidate: vi.fn(async () => undefined),
  instruments: [] as PaymentInstrument[],
}));

vi.mock('../../hooks/firestore/useTransactionImportCandidates', () => ({
  useTransactionImportCandidates: () => ({
    candidates: H.candidates,
    loading: H.loading,
    error: H.error,
    reachedLimit: H.reachedLimit,
    dismissCandidate: H.dismissCandidate,
  }),
}));

vi.mock('../../hooks/firestore/usePaymentInstruments', () => ({
  usePaymentInstruments: () => ({
    instruments: H.instruments,
    loading: false,
    error: null,
    createInstrument: vi.fn(),
    updateInstrument: vi.fn(),
    setInstrumentActive: vi.fn(),
    deleteInstrument: vi.fn(),
  }),
}));

vi.mock('../../components/views/transactions/components/TransactionImportReviewModal', () => ({
  TransactionImportReviewModal: ({
    candidate,
  }: {
    candidate: PendingTransactionImportCandidate | null;
  }) => candidate ? <div role="dialog">Revisando {candidate.merchant}</div> : null,
}));

import { TransactionImportInbox } from '../../components/views/transactions/components/TransactionImportInbox';

const accounts: Account[] = [{
  id: 'savings',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 1_000_000,
}, {
  id: 'card',
  name: 'TC principal',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 2_000_000,
  usedCredit: 0,
}];
const categories: Categories = {
  expense: ['Alimentación'],
  income: ['Salario'],
};

const candidate = (
  id: string,
  merchant: string,
): PendingTransactionImportCandidate => ({
  id,
  schemaVersion: 1,
  source: 'android-notification',
  sourcePackage: 'com.example.bank',
  occurredAt: new Date('2026-08-25T13:00:00.000Z'),
  amountMinor: 1_234_567,
  currency: 'COP',
  merchant,
  cardLast4: '1234',
  parserId: 'strict-cop-purchase',
  parserVersion: 1,
  confidence: 'high',
  status: 'pending',
});

beforeEach(() => {
  H.candidates = [
    candidate('a'.repeat(64), 'Mercado Central'),
    candidate('b'.repeat(64), 'Café del barrio'),
  ];
  H.loading = false;
  H.error = null;
  H.reachedLimit = false;
  H.instruments = [];
  vi.clearAllMocks();
});

describe('TransactionImportInbox', () => {
  it('shows a truthful pending counter and expands from a compact ledger toggle', () => {
    H.candidates = [
      { ...candidate('a'.repeat(64), 'Mercado Central'), cardLast4: '9876' },
      candidate('b'.repeat(64), 'Café del barrio'),
    ];
    H.instruments = [{
      id: 'instrument-1',
      schemaVersion: 1,
      label: 'Oro',
      accountId: 'card',
      kind: 'wallet-token',
      last4: '9876',
      network: 'visa',
      active: true,
      createdAt: new Date('2026-08-01T12:00:00.000Z'),
      updatedAt: new Date('2026-08-01T12:00:00.000Z'),
    }];
    render(
      <TransactionImportInbox
        userId="owner"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );

    const toggle = screen.getByRole('button', {
      name: 'Compras del celular, 2 pendientes',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Mercado Central')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Mercado Central')).toBeInTheDocument();
    expect(screen.getByText(/todavía no afecta saldos ni estadísticas/i)).toBeInTheDocument();
    expect(screen.getAllByText('Android')).toHaveLength(2);
    expect(screen.getByText('TC principal')).toBeInTheDocument();
    expect(screen.queryByText('Oro')).not.toBeInTheDocument();
    expect(screen.queryByText('Confianza alta')).not.toBeInTheDocument();
    expect(screen.queryByText('com.example.bank')).not.toBeInTheDocument();
  });

  it('warns when the bounded first page reaches 100 candidates', () => {
    H.reachedLimit = true;
    render(
      <TransactionImportInbox
        userId="owner"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /compras del celular/i }));
    expect(screen.getByText(/mostrando las 100 compras más recientes/i)).toBeInTheDocument();
  });

  it('dismisses a candidate and returns focus to the inbox control', async () => {
    render(
      <TransactionImportInbox
        userId="owner"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );
    const toggle = screen.getByRole('button', { name: /compras del celular/i });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', {
      name: 'Descartar compra en Mercado Central',
    }));

    await waitFor(() => expect(H.dismissCandidate).toHaveBeenCalledWith(
      'a'.repeat(64),
    ));
    expect(toggle).toHaveFocus();
  });

  it('surfaces invalid subscription data without hiding the valid queue', () => {
    H.error = new Error(`El documento ${'f'.repeat(64)} tiene un valor inválido.`);
    render(
      <TransactionImportInbox
        userId="owner"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /compras del celular/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('valor inválido');
    expect(screen.getByText('Mercado Central')).toBeInTheDocument();
  });

  it('keeps guest mode unchanged', () => {
    render(
      <TransactionImportInbox
        userId={null}
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );
    expect(screen.queryByText(/compras del celular/i)).not.toBeInTheDocument();
  });
});
