import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type FakeSource = {
  path: string;
  kind: 'query' | 'document';
  constraints?: Array<{ kind: string }>;
};
type FakeDocument = { id: string; data: () => Record<string, unknown> };
type FakeSnapshot = {
  docs: FakeDocument[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
};

const firestore = vi.hoisted(() => ({
  listeners: [] as Array<{
    source: FakeSource;
    next: (snapshot: FakeSnapshot) => void;
    error: (error: Error) => void;
    unsubscribed: boolean;
  }>,
}));

vi.mock('../../lib/firebaseDb', () => ({ db: {} }));
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string): FakeSource => ({ path, kind: 'query' }),
  doc: (_db: unknown, path: string): FakeSource => ({ path, kind: 'document' }),
  query: (source: FakeSource, ...constraints: Array<{ kind: string }>): FakeSource => ({
    ...source,
    constraints,
  }),
  orderBy: () => ({ kind: 'orderBy' }),
  where: vi.fn(),
  limit: () => ({ kind: 'limit' }),
  startAfter: vi.fn(),
  onSnapshot: (...args: unknown[]) => {
    const source = args[0] as FakeSource;
    const nextIndex = typeof args[1] === 'function' ? 1 : 2;
    const listener = {
      source,
      next: args[nextIndex] as (snapshot: FakeSnapshot) => void,
      error: args[nextIndex + 1] as (error: Error) => void,
      unsubscribed: false,
    };
    firestore.listeners.push(listener);
    return () => {
      listener.unsubscribed = true;
    };
  },
}));

import { FirestoreProvider } from '../../contexts/FirestoreContext';
import { FinanceProvider, useFinance } from '../../contexts/FinanceContext';

const snapshot = (docs: FakeDocument[], fromCache: boolean): FakeSnapshot => ({
  docs,
  metadata: { fromCache, hasPendingWrites: false },
});

const listenerFor = (suffix: string) => {
  const listener = firestore.listeners.find(({ source }) => source.path.endsWith(suffix));
  if (!listener) throw new Error(`Falta listener para ${suffix}`);
  return listener;
};

const transactionListeners = (kind: 'head' | 'full') => firestore.listeners.filter(({ source }) => (
  source.path.endsWith('/transactions')
  && (kind === 'head'
    ? source.constraints?.some(constraint => constraint.kind === 'limit')
    : !source.constraints?.some(constraint => constraint.kind === 'limit'))
));

function VisibleSettlingState() {
  const { balancesReady, totalBalance, firestoreError, retryLoad } = useFinance();
  return (
    <>
      <output>{`${balancesReady ? 'ready' : 'settling'}|${totalBalance}|${firestoreError?.message ?? 'ok'}`}</output>
      <button type="button" onClick={retryLoad}>retry</button>
    </>
  );
}

describe('ledger readiness through providers', () => {
  afterEach(() => {
    firestore.listeners.length = 0;
  });

  it('muestra settling con un head corto cacheado hasta que el servidor lo confirma', () => {
    render(
      <FirestoreProvider userId="user-1">
        <FinanceProvider userId="user-1">
          <VisibleSettlingState />
        </FinanceProvider>
      </FirestoreProvider>
    );

    act(() => {
      listenerFor('/transactions').next(snapshot([{
        id: 'cached',
        data: () => ({
          type: 'expense', amount: 25, category: 'Otros', description: 'x',
          accountId: 'account-1', paid: true, date: { toDate: () => new Date('2026-07-01') },
        }),
      }], true));
      listenerFor('/accounts').next(snapshot([{
        id: 'account-1',
        data: () => ({ name: 'Cuenta', type: 'savings', initialBalance: 100, isDefault: true }),
      }], false));
      listenerFor('/categories').next(snapshot([{
        id: 'category-1', data: () => ({ name: 'Otros', type: 'expense' }),
      }], false));
    });

    expect(screen.getByRole('status')).toHaveTextContent('settling|75|ok');

    act(() => {
      listenerFor('/transactions').next(snapshot([{
        id: 'cached',
        data: () => ({
          type: 'expense', amount: 25, category: 'Otros', description: 'x',
          accountId: 'account-1', paid: true, date: { toDate: () => new Date('2026-07-01') },
        }),
      }], false));
    });

    expect(screen.getByRole('status')).toHaveTextContent('ready|75|ok');
  });

  it('expone el error terminal full y retryLoad recrea una sola fuente cercando callbacks stale', async () => {
    render(
      <FirestoreProvider userId="user-1">
        <FinanceProvider userId="user-1">
          <VisibleSettlingState />
        </FinanceProvider>
      </FirestoreProvider>
    );

    const headDocs = Array.from({ length: 500 }, (_, index) => ({
      id: `head-${index}`,
      data: () => ({
        type: 'income', amount: 1, category: 'Otros', description: 'x',
        accountId: 'account-1', paid: true, date: { toDate: () => new Date('2026-07-01') },
      }),
    }));
    const row501 = {
      id: 'row-501',
      data: () => ({
        type: 'income', amount: 50, category: 'Otros', description: 'old',
        accountId: 'account-1', paid: true, date: { toDate: () => new Date('2024-01-01') },
      }),
    };

    act(() => {
      listenerFor('/accounts').next(snapshot([{
        id: 'account-1',
        data: () => ({ name: 'Cuenta', type: 'savings', initialBalance: 0, isDefault: true }),
      }], false));
      transactionListeners('head')[0].next(snapshot(headDocs, false));
    });
    await waitFor(() => expect(transactionListeners('full')).toHaveLength(1));
    const oldFullListener = transactionListeners('full')[0];
    act(() => oldFullListener.next(snapshot([...headDocs, row501], false)));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ready|'));

    act(() => oldFullListener.error(new Error('full history failed')));
    expect(screen.getByRole('status')).toHaveTextContent('ready|550|full history failed');

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(transactionListeners('full')).toHaveLength(2));
    expect(oldFullListener.unsubscribed).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('ready|550|ok');

    // El callback capturado del listener terminal ya no puede reemplazar row-501.
    act(() => oldFullListener.next(snapshot([{
      id: 'stale-row',
      data: row501.data,
    }], false)));
    expect(screen.getByRole('status')).toHaveTextContent('ready|550|ok');

    const freshHeadListener = transactionListeners('head').at(-1);
    const freshFullListener = transactionListeners('full').at(-1);
    if (!freshHeadListener || !freshFullListener) throw new Error('Faltan listeners frescos');
    act(() => {
      freshHeadListener.next(snapshot(headDocs, false));
      freshFullListener.next(snapshot([...headDocs, row501], false));
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ready|550|ok'));
    expect(transactionListeners('full')).toHaveLength(2);
  });
});
