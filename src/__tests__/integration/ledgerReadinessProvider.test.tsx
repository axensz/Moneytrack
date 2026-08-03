import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type FakeSource = { path: string; kind: 'query' | 'document' };
type FakeDocument = { id: string; data: () => Record<string, unknown> };
type FakeSnapshot = {
  docs: FakeDocument[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
};

const firestore = vi.hoisted(() => ({
  listeners: [] as Array<{
    source: FakeSource;
    next: (snapshot: FakeSnapshot) => void;
  }>,
}));

vi.mock('../../lib/firebaseDb', () => ({ db: {} }));
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string): FakeSource => ({ path, kind: 'query' }),
  doc: (_db: unknown, path: string): FakeSource => ({ path, kind: 'document' }),
  query: (source: FakeSource): FakeSource => source,
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  onSnapshot: (
    source: FakeSource,
    optionsOrNext: Record<string, unknown> | ((snapshot: FakeSnapshot) => void),
    nextOrError?: ((snapshot: FakeSnapshot) => void) | ((error: Error) => void),
  ) => {
    const next = typeof optionsOrNext === 'function' ? optionsOrNext : nextOrError as (snapshot: FakeSnapshot) => void;
    firestore.listeners.push({ source, next });
    return () => {};
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

function VisibleSettlingState() {
  const { balancesReady, totalBalance } = useFinance();
  return <output>{`${balancesReady ? 'ready' : 'settling'}|${totalBalance}`}</output>;
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

    expect(screen.getByRole('status')).toHaveTextContent('settling|75');

    act(() => {
      listenerFor('/transactions').next(snapshot([{
        id: 'cached',
        data: () => ({
          type: 'expense', amount: 25, category: 'Otros', description: 'x',
          accountId: 'account-1', paid: true, date: { toDate: () => new Date('2026-07-01') },
        }),
      }], false));
    });

    expect(screen.getByRole('status')).toHaveTextContent('ready|75');
  });
});
