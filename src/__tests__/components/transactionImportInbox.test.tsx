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

type PendingNotificationCandidate = Extract<
  PendingTransactionImportCandidate,
  { source: 'android-notification' }
>;
type PendingShortcutCandidate = Extract<
  PendingTransactionImportCandidate,
  { source: 'android-shortcut' }
>;

const H = vi.hoisted(() => ({
  candidates: [] as PendingTransactionImportCandidate[],
  requestedCandidate: null as PendingTransactionImportCandidate | null,
  requestedStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'missing' | 'terminal' | 'error',
  requestedRequest: null as { userId: string; candidateId: string } | null,
  requestedIds: [] as Array<string | null>,
  loading: false,
  error: null as Error | null,
  reachedLimit: false,
  dismissCandidate: vi.fn(async () => undefined),
  instruments: [] as PaymentInstrument[],
}));

vi.mock('../../hooks/firestore/useTransactionImportCandidates', () => ({
  useTransactionImportCandidates: (_userId: string | null, requestedId: string | null) => {
    H.requestedIds.push(requestedId);
    return {
    candidates: H.candidates,
    requestedCandidate: H.requestedCandidate,
    requestedStatus: H.requestedStatus,
    requestedRequest: H.requestedRequest,
    loading: H.loading,
    error: H.error,
    reachedLimit: H.reachedLimit,
    dismissCandidate: H.dismissCandidate,
    };
  },
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
): PendingNotificationCandidate => ({
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

const shortcutCandidate = (
  id = 'c'.repeat(64),
): PendingShortcutCandidate => ({
  id,
  schemaVersion: 3,
  source: 'android-shortcut',
  occurredAt: new Date('2026-09-13T17:00:00.000Z'),
  amountMinor: 259_900,
  currency: 'COP',
  merchant: 'Almuerzo',
  suggestedAccountId: 'savings',
  suggestedCategory: 'Alimentación',
  createdAt: new Date('2026-09-13T17:01:00.000Z'),
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
  H.requestedCandidate = null;
  H.requestedStatus = 'idle';
  H.requestedRequest = null;
  H.requestedIds = [];
  H.instruments = [];
  window.history.replaceState({}, '', '/');
  vi.clearAllMocks();
});

describe('TransactionImportInbox', () => {
  it('stays visually absent when there are no pending purchases', () => {
    H.candidates = [];
    render(
      <TransactionImportInbox
        userId="owner"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );

    expect(screen.queryByRole('button', { name: /compras del celular/i })).not.toBeInTheDocument();
    expect(screen.queryByText('No hay compras por revisar')).not.toBeInTheDocument();
  });

  it('shows a standalone alert instead of an empty inbox when loading fails', () => {
    H.candidates = [];
    H.error = new Error('No se pudo leer la bandeja.');
    render(
      <TransactionImportInbox
        userId="owner"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo leer la bandeja.');
    expect(screen.queryByRole('button', { name: /compras del celular/i })).not.toBeInTheDocument();
  });

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

  it('opens and expands exactly the shortcut candidate requested by the URL', async () => {
    const requested = shortcutCandidate();
    H.candidates = [candidate('a'.repeat(64), 'Otra compra'), requested];
    H.requestedCandidate = requested;
    H.requestedStatus = 'ready';
    H.requestedRequest = { userId: 'owner', candidateId: requested.id };
    window.history.replaceState(
      {},
      '',
      `/?view=transactions&reviewAndroid=${requested.id}`,
    );

    render(
      <TransactionImportInbox
        userId="owner"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent(
      'Revisando Almuerzo',
    ));
    expect(H.requestedIds).toContain(requested.id);
    expect(screen.getByRole('button', {
      name: 'Compras del celular, 2 pendientes',
    })).toHaveAttribute('aria-expanded', 'true');
    expect(window.location.search).toBe('?view=transactions');
  });

  it('keeps tracking the exact handoff after opening and closes it on a terminal server state', async () => {
    const requested = shortcutCandidate();
    H.candidates = [requested];
    H.requestedCandidate = requested;
    H.requestedStatus = 'ready';
    H.requestedRequest = { userId: 'owner', candidateId: requested.id };
    window.history.replaceState(
      {},
      '',
      `/?view=transactions&reviewAndroid=${requested.id}`,
    );
    const view = render(
      <TransactionImportInbox
        userId="owner"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(window.location.search).toBe('?view=transactions');

    H.requestedCandidate = null;
    H.requestedStatus = 'terminal';
    view.rerender(
      <TransactionImportInbox
        userId="owner"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/ya fue confirmado o descartado/i);
  });

  it('never renders a requested candidate under a different user session', async () => {
    const requested = shortcutCandidate();
    H.candidates = [requested];
    H.requestedCandidate = requested;
    H.requestedStatus = 'ready';
    H.requestedRequest = { userId: 'owner-a', candidateId: requested.id };
    window.history.replaceState(
      {},
      '',
      `/?view=transactions&reviewAndroid=${requested.id}`,
    );
    const view = render(
      <TransactionImportInbox
        userId="owner-a"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    H.requestedStatus = 'loading';
    view.rerender(
      <TransactionImportInbox
        userId="owner-b"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    H.requestedStatus = 'ready';
    view.rerender(
      <TransactionImportInbox
        userId="owner-b"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('forgets a manually selected candidate when the user changes', () => {
    const view = render(
      <TransactionImportInbox
        userId="owner-a"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /compras del celular/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Revisar' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    view.rerender(
      <TransactionImportInbox
        userId="owner-b"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    view.rerender(
      <TransactionImportInbox
        userId="owner-a"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rejects and removes an invalid shortcut URL without selecting another row', async () => {
    window.history.replaceState(
      {},
      '',
      '/?view=transactions&reviewAndroid=abc',
    );

    render(
      <TransactionImportInbox
        userId="owner"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      /enlace del gasto rápido no es válido/i,
    ));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(H.requestedIds.at(-1)).toBeNull();
    expect(window.location.search).toBe('?view=transactions');
  });

  it.each([
    ['missing', /ya no existe|no está disponible/i],
    ['terminal', /ya fue confirmado o descartado/i],
  ] as const)('does not approximate another candidate when the request is %s', async (
    requestedStatus,
    expectedMessage,
  ) => {
    const requestedId = 'd'.repeat(64);
    H.requestedStatus = requestedStatus;
    H.requestedRequest = { userId: 'owner', candidateId: requestedId };
    window.history.replaceState(
      {},
      '',
      `/?view=transactions&reviewAndroid=${requestedId}`,
    );

    render(
      <TransactionImportInbox
        userId="owner"
        accounts={accounts}
        categories={categories}
        isOnline
      />,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      expectedMessage,
    ));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.search).toBe('?view=transactions');
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
