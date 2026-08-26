import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  serverTime: { __serverTimestamp: true },
  deletedField: { __deleteField: true },
  listeners: [] as Array<{
    path: string;
    next: (snapshot: {
      docs: Array<{ id: string; data: () => Record<string, unknown> }>;
    }) => void;
    error: (error: Error) => void;
    active: boolean;
  }>,
  writes: [] as Array<{
    operation: 'add' | 'update' | 'delete';
    path: string;
    data?: Record<string, unknown>;
  }>,
  writeError: null as Error | null,
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }),
  doc: (_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }),
  onSnapshot: (
    ref: { path: string },
    next: (snapshot: {
      docs: Array<{ id: string; data: () => Record<string, unknown> }>;
    }) => void,
    error: (error: Error) => void,
  ) => {
    const listener = { path: ref.path, next, error, active: true };
    M.listeners.push(listener);
    return () => {
      listener.active = false;
    };
  },
  addDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    if (M.writeError) throw M.writeError;
    M.writes.push({ operation: 'add', path: ref.path, data });
    return { id: 'instrument-created' };
  },
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    if (M.writeError) throw M.writeError;
    M.writes.push({ operation: 'update', path: ref.path, data });
  },
  deleteDoc: async (ref: { path: string }) => {
    if (M.writeError) throw M.writeError;
    M.writes.push({ operation: 'delete', path: ref.path });
  },
  serverTimestamp: () => M.serverTime,
  deleteField: () => M.deletedField,
}));

vi.mock('../../lib/firebaseDb', () => ({ db: {} }));

import { usePaymentInstruments } from '../../hooks/firestore/usePaymentInstruments';

const timestamp = (iso: string) => ({
  toDate: () => new Date(iso),
});

const instrumentDocument = (
  id: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  data: () => ({
    schemaVersion: 1,
    label: 'Visa del celular',
    accountId: 'credit-account-1',
    kind: 'wallet-token',
    last4: '1234',
    network: 'visa',
    active: true,
    createdAt: timestamp('2026-08-25T12:00:00.000Z'),
    updatedAt: timestamp('2026-08-25T12:01:00.000Z'),
    ...overrides,
  }),
});

const emit = (
  listenerIndex: number,
  documents: ReturnType<typeof instrumentDocument>[],
) => {
  const listener = M.listeners[listenerIndex];
  if (!listener) throw new Error('La prueba requiere una suscripción');
  act(() => listener.next({ docs: documents }));
};

describe('usePaymentInstruments', () => {
  beforeEach(() => {
    M.listeners = [];
    M.writes = [];
    M.writeError = null;
  });

  it('subscribes once to the authenticated owner collection and decodes rows', () => {
    const { result } = renderHook(() => usePaymentInstruments('user-1'));

    expect(M.listeners.map(listener => listener.path)).toEqual([
      'users/user-1/paymentInstruments',
    ]);
    emit(0, [instrumentDocument('instrument-1')]);

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.instruments).toEqual([{
      id: 'instrument-1',
      schemaVersion: 1,
      label: 'Visa del celular',
      accountId: 'credit-account-1',
      kind: 'wallet-token',
      last4: '1234',
      network: 'visa',
      active: true,
      createdAt: new Date('2026-08-25T12:00:00.000Z'),
      updatedAt: new Date('2026-08-25T12:01:00.000Z'),
    }]);
  });

  it('writes schema v2 and can remove last4 from a Wallet instrument', async () => {
    const { result } = renderHook(() => usePaymentInstruments('user-1'));

    await act(async () => {
      await result.current.createInstrument({
        label: 'Visa principal',
        accountId: 'credit-account-1',
        kind: 'physical-card',
        last4: '9876',
        network: 'visa',
      });
      await result.current.updateInstrument('instrument-1', {
        label: 'Visa editada',
        accountId: 'credit-account-2',
        last4: undefined,
        network: 'mastercard',
      });
      await result.current.setInstrumentActive('instrument-1', false);
      await result.current.deleteInstrument('instrument-1');
    });

    expect(M.writes).toEqual([
      {
        operation: 'add',
        path: 'users/user-1/paymentInstruments',
        data: {
          schemaVersion: 2,
          label: 'Visa principal',
          accountId: 'credit-account-1',
          kind: 'physical-card',
          last4: '9876',
          network: 'visa',
          active: true,
          createdAt: M.serverTime,
          updatedAt: M.serverTime,
        },
      },
      {
        operation: 'update',
        path: 'users/user-1/paymentInstruments/instrument-1',
        data: {
          schemaVersion: 2,
          label: 'Visa editada',
          accountId: 'credit-account-2',
          last4: M.deletedField,
          network: 'mastercard',
          updatedAt: M.serverTime,
        },
      },
      {
        operation: 'update',
        path: 'users/user-1/paymentInstruments/instrument-1',
        data: {
          active: false,
          updatedAt: M.serverTime,
        },
      },
      {
        operation: 'delete',
        path: 'users/user-1/paymentInstruments/instrument-1',
      },
    ]);
  });

  it('omits last4 when creating an alias-only Wallet instrument', async () => {
    const { result } = renderHook(() => usePaymentInstruments('user-1'));

    await act(async () => {
      await result.current.createInstrument({
        label: 'Oro',
        accountId: 'credit-account-1',
        kind: 'wallet-token',
        network: 'unknown',
      });
    });

    expect(M.writes[0]).toEqual({
      operation: 'add',
      path: 'users/user-1/paymentInstruments',
      data: {
        schemaVersion: 2,
        label: 'Oro',
        accountId: 'credit-account-1',
        kind: 'wallet-token',
        network: 'unknown',
        active: true,
        createdAt: M.serverTime,
        updatedAt: M.serverTime,
      },
    });
  });

  it('cleans up and isolates state when the authenticated user changes', () => {
    const { result, rerender } = renderHook(
      ({ userId }) => usePaymentInstruments(userId),
      { initialProps: { userId: 'user-1' as string | null } },
    );
    emit(0, [instrumentDocument('private-user-1')]);

    rerender({ userId: 'user-2' });

    expect(M.listeners).toHaveLength(2);
    expect(M.listeners[0].active).toBe(false);
    expect(result.current.instruments).toEqual([]);

    emit(0, [instrumentDocument('late-private-user-1')]);
    expect(result.current.instruments).toEqual([]);

    emit(1, [instrumentDocument('private-user-2')]);
    expect(result.current.instruments.map(item => item.id)).toEqual([
      'private-user-2',
    ]);
  });

  it('exposes listener and strict-decoder errors without keeping invalid rows', () => {
    const { result } = renderHook(() => usePaymentInstruments('user-1'));

    emit(0, [instrumentDocument('invalid', { pan: '4111111111111111' })]);
    expect(result.current.instruments).toEqual([]);
    expect(result.current.error?.message).toMatch(/invalid/i);

    act(() => M.listeners[0].error(new Error('permission denied')));
    expect(result.current.error?.message).toBe('permission denied');
    expect(result.current.loading).toBe(false);
  });

  it('propagates write failures and does not invent local success', async () => {
    M.writeError = new Error('write denied');
    const { result } = renderHook(() => usePaymentInstruments('user-1'));

    await expect(result.current.createInstrument({
      label: 'Visa principal',
      accountId: 'credit-account-1',
      kind: 'physical-card',
      last4: '9876',
      network: 'visa',
    })).rejects.toThrow('write denied');
    expect(M.writes).toEqual([]);
  });

  it('does not subscribe or write in guest mode', async () => {
    const { result } = renderHook(() => usePaymentInstruments(null));

    await act(async () => {
      await result.current.createInstrument({
        label: 'No sincronizado',
        accountId: 'local',
        kind: 'physical-card',
        last4: '1234',
        network: 'unknown',
      });
      await result.current.updateInstrument('instrument-1', { label: 'Nada' });
      await result.current.setInstrumentActive('instrument-1', false);
      await result.current.deleteInstrument('instrument-1');
    });

    expect(M.listeners).toEqual([]);
    expect(M.writes).toEqual([]);
    expect(result.current).toEqual(expect.objectContaining({
      instruments: [],
      loading: false,
      error: null,
    }));
  });
});
