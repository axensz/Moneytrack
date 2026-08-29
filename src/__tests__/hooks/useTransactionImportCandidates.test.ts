import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  serverTime: { __serverTimestamp: true },
  queries: [] as Array<{
    path: string;
    constraints: Array<Record<string, unknown>>;
  }>,
  listeners: [] as Array<{
    next: (snapshot: {
      docs: Array<{ id: string; data: () => Record<string, unknown> }>;
    }) => void;
    error: (error: Error) => void;
    active: boolean;
  }>,
  writes: [] as Array<{
    path: string;
    data: Record<string, unknown>;
  }>,
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }),
  doc: (_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }),
  where: (field: string, operator: string, value: unknown) => ({
    type: 'where',
    field,
    operator,
    value,
  }),
  orderBy: (field: string, direction: string) => ({
    type: 'orderBy',
    field,
    direction,
  }),
  limit: (value: number) => ({ type: 'limit', value }),
  query: (
    ref: { path: string },
    ...constraints: Array<Record<string, unknown>>
  ) => {
    const result = { path: ref.path, constraints };
    M.queries.push(result);
    return result;
  },
  onSnapshot: (
    _query: unknown,
    next: (snapshot: {
      docs: Array<{ id: string; data: () => Record<string, unknown> }>;
    }) => void,
    error: (error: Error) => void,
  ) => {
    const listener = { next, error, active: true };
    M.listeners.push(listener);
    return () => {
      listener.active = false;
    };
  },
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    M.writes.push({ path: ref.path, data });
  },
  serverTimestamp: () => M.serverTime,
}));

vi.mock('../../lib/firebaseDb', () => ({ db: {} }));

import { useTransactionImportCandidates } from '../../hooks/firestore/useTransactionImportCandidates';

const timestamp = (iso: string) => ({
  toDate: () => new Date(iso),
});

const candidateDocument = (
  id: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  data: () => ({
    schemaVersion: 1,
    source: 'android-notification',
    sourcePackage: 'com.example.bank',
    occurredAt: timestamp('2026-08-25T13:00:00.000Z'),
    amountMinor: 1_234_567,
    currency: 'COP',
    merchant: 'Comercio de prueba',
    cardLast4: '1234',
    parserId: 'strict-cop-purchase',
    parserVersion: 1,
    confidence: 'high',
    status: 'pending',
    ...overrides,
  }),
});

const emit = (
  listenerIndex: number,
  documents: ReturnType<typeof candidateDocument>[],
) => {
  const listener = M.listeners[listenerIndex];
  if (!listener) throw new Error('La prueba requiere una suscripción');
  act(() => listener.next({ docs: documents }));
};

describe('useTransactionImportCandidates', () => {
  beforeEach(() => {
    M.queries = [];
    M.listeners = [];
    M.writes = [];
  });

  it('subscribes to the first 100 pending owner candidates plus one overflow row', () => {
    const { result } = renderHook(() => (
      useTransactionImportCandidates('user-1')
    ));

    expect(M.queries).toEqual([{
      path: 'users/user-1/transactionImportCandidates',
      constraints: [
        { type: 'where', field: 'status', operator: '==', value: 'pending' },
        { type: 'orderBy', field: 'occurredAt', direction: 'desc' },
        { type: 'limit', value: 101 },
      ],
    }]);

    emit(0, [candidateDocument('a'.repeat(64))]);

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.candidates).toEqual([
      expect.objectContaining({
        id: 'a'.repeat(64),
        amountMinor: 1_234_567,
        occurredAt: new Date('2026-08-25T13:00:00.000Z'),
        status: 'pending',
      }),
    ]);
    expect(result.current.reachedLimit).toBe(false);
  });

  it('does not report a limit when the first page contains exactly 100 rows', () => {
    const { result } = renderHook(() => (
      useTransactionImportCandidates('user-1')
    ));
    emit(0, Array.from({ length: 100 }, (_, index) => (
      candidateDocument(index.toString(16).padStart(64, '0'))
    )));

    expect(result.current.candidates).toHaveLength(100);
    expect(result.current.reachedLimit).toBe(false);
  });

  it('reports an overflow at 101 rows while exposing only the first 100', () => {
    const { result } = renderHook(() => (
      useTransactionImportCandidates('user-1')
    ));
    const documents = Array.from({ length: 101 }, (_, index) => (
      candidateDocument(index.toString(16).padStart(64, '0'))
    ));

    emit(0, documents);

    expect(result.current.candidates).toHaveLength(100);
    expect(result.current.candidates.at(-1)?.id).toBe(
      '63'.padStart(64, '0'),
    );
    expect(result.current.reachedLimit).toBe(true);
  });

  it('excludes malformed documents and exposes a repairable error', () => {
    const { result } = renderHook(() => (
      useTransactionImportCandidates('user-1')
    ));
    emit(0, [
      candidateDocument('a'.repeat(64)),
      candidateDocument('b'.repeat(64), { amountMinor: 0 }),
    ]);

    expect(result.current.candidates.map(candidate => candidate.id)).toEqual([
      'a'.repeat(64),
    ]);
    expect(result.current.error?.message).toContain('b'.repeat(64));
  });

  it('cleans up and ignores late snapshots when the user changes', () => {
    const { result, rerender } = renderHook(
      ({ userId }) => useTransactionImportCandidates(userId),
      { initialProps: { userId: 'user-1' as string | null } },
    );
    emit(0, [candidateDocument('a'.repeat(64))]);

    rerender({ userId: 'user-2' });
    expect(M.listeners[0].active).toBe(false);
    expect(result.current.candidates).toEqual([]);

    emit(0, [candidateDocument('b'.repeat(64))]);
    expect(result.current.candidates).toEqual([]);

    emit(1, [candidateDocument('c'.repeat(64))]);
    expect(result.current.candidates.map(candidate => candidate.id)).toEqual([
      'c'.repeat(64),
    ]);
  });

  it('writes only the terminal pending-to-dismissed fields', async () => {
    const { result } = renderHook(() => (
      useTransactionImportCandidates('user-1')
    ));

    await act(async () => {
      await result.current.dismissCandidate('a'.repeat(64));
    });

    expect(M.writes).toEqual([{
      path: `users/user-1/transactionImportCandidates/${'a'.repeat(64)}`,
      data: {
        status: 'dismissed',
        dismissedAt: M.serverTime,
      },
    }]);
  });

  it('exposes subscription errors and performs no guest work', async () => {
    const authenticated = renderHook(() => (
      useTransactionImportCandidates('user-1')
    ));
    act(() => M.listeners[0].error(new Error('permission denied')));
    expect(authenticated.result.current.error?.message).toBe('permission denied');
    expect(authenticated.result.current.loading).toBe(false);

    const guest = renderHook(() => useTransactionImportCandidates(null));
    await act(async () => {
      await guest.result.current.dismissCandidate('a'.repeat(64));
    });
    expect(M.queries).toHaveLength(1);
    expect(M.writes).toEqual([]);
    expect(guest.result.current).toEqual(expect.objectContaining({
      candidates: [],
      loading: false,
      error: null,
    }));
  });
});
