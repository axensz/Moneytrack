import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeDocSnapshot = {
  exists: () => boolean;
  data: () => Record<string, unknown> | undefined;
};

const firestore = vi.hoisted(() => ({
  listeners: [] as Array<{
    path: string;
    next: (snap: FakeDocSnapshot) => void;
    error: (err: Error) => void;
    unsubscribed: boolean;
  }>,
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { mocked: true } }));
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  onSnapshot: (
    source: { path: string },
    next: (snap: FakeDocSnapshot) => void,
    error: (err: Error) => void,
  ) => {
    const listener = { path: source.path, next, error, unsubscribed: false };
    firestore.listeners.push(listener);
    return () => { listener.unsubscribed = true; };
  },
}));

import { useNotificationAuthority } from '../../hooks/useNotificationAuthority';

const runtimeListener = (userId: string, latest = false) => {
  const suffix = `users/${userId}/notificationRuntime/state`;
  const matches = firestore.listeners.filter(l => l.path.endsWith(suffix) && !l.unsubscribed);
  const listener = latest ? matches.at(-1) : matches[0];
  if (!listener) throw new Error(`No runtime listener for ${userId}`);
  return listener;
};

const snap = (data: Record<string, unknown> | null): FakeDocSnapshot => ({
  exists: () => data !== null,
  data: () => data ?? undefined,
});

beforeEach(() => {
  firestore.listeners.length = 0;
  window.sessionStorage.clear();
});

describe('useNotificationAuthority — lee solo notificationRuntime/state', () => {
  it('invitado sin userId es guest sin listener', () => {
    const { result } = renderHook(() => useNotificationAuthority(null));
    expect(result.current).toEqual({
      kind: 'guest', effective: 'foreground', writer: { namespace: 'guest' },
    });
    expect(firestore.listeners).toHaveLength(0);
  });

  it('autenticado arranca en transient checking (compat) hasta el primer snapshot', () => {
    const { result } = renderHook(() => useNotificationAuthority('user-a'));
    expect(result.current).toEqual({
      kind: 'transient', effective: 'foreground', reason: 'checking', writer: { namespace: 'compat' },
    });
    expect(runtimeListener('user-a').path).toBe('users/user-a/notificationRuntime/state');
  });

  it('runtime ausente confirmado corre compat y persiste backendConfirmed', () => {
    const { result } = renderHook(() => useNotificationAuthority('user-a'));
    act(() => runtimeListener('user-a').next(snap(null)));
    expect(result.current).toEqual({
      kind: 'compat', effective: 'foreground', writer: { namespace: 'compat' },
    });
  });

  it('runtime foreground activo corre con la generación exacta', () => {
    const { result } = renderHook(() => useNotificationAuthority('user-a'));
    act(() => runtimeListener('user-a').next(snap({
      authority: 'foreground', configVersion: 7, activatedAt: { toMillis: () => 1_700_000_000_000 },
    })));
    expect(result.current).toEqual({
      kind: 'foreground', effective: 'foreground', configVersion: 7,
      writer: { namespace: 'v7', authorityConfigVersion: 7 },
    });
  });

  it('durable activo no presenta (writer null); activatedAt null es cutover', () => {
    const { result } = renderHook(() => useNotificationAuthority('user-a'));
    act(() => runtimeListener('user-a').next(snap({
      authority: 'durable', configVersion: 9, activatedAt: { toMillis: () => 1 },
    })));
    expect(result.current).toEqual({
      kind: 'durable', effective: 'durable', configVersion: 9, writer: null,
    });

    act(() => runtimeListener('user-a').next(snap({
      authority: 'durable', configVersion: 10, activatedAt: null,
    })));
    expect(result.current).toEqual({
      kind: 'transient', effective: 'durable', reason: 'cutover', writer: null,
    });
  });

  it('un error del listener reutiliza el último estado confirmado de la cuenta', () => {
    const { result } = renderHook(() => useNotificationAuthority('user-a'));
    act(() => runtimeListener('user-a').next(snap({
      authority: 'foreground', configVersion: 5, activatedAt: { toMillis: () => 1 },
    })));
    expect(result.current.kind).toBe('foreground');

    act(() => runtimeListener('user-a').error(new Error('permission denied')));
    expect(result.current).toEqual({
      kind: 'transient', effective: 'foreground', reason: 'error',
      writer: { namespace: 'v5', authorityConfigVersion: 5 },
    });
  });

  it('cambio de cuenta A→B: B nunca hereda la autoridad de A', () => {
    const { result, rerender } = renderHook(
      ({ userId }) => useNotificationAuthority(userId),
      { initialProps: { userId: 'user-a' as string | null } },
    );
    act(() => runtimeListener('user-a').next(snap({
      authority: 'durable', configVersion: 3, activatedAt: { toMillis: () => 1 },
    })));
    expect(result.current).toEqual({
      kind: 'durable', effective: 'durable', configVersion: 3, writer: null,
    });

    rerender({ userId: 'user-b' });
    // B arranca en checking/compat, NUNCA hereda durable de A.
    expect(result.current).toEqual({
      kind: 'transient', effective: 'foreground', reason: 'checking', writer: { namespace: 'compat' },
    });
    // El listener de A quedó cercado (unsubscribed) y no puede reafirmar B.
    const staleA = firestore.listeners.find(l => l.path.endsWith('users/user-a/notificationRuntime/state'));
    expect(staleA?.unsubscribed).toBe(true);
    act(() => staleA?.next(snap({ authority: 'durable', configVersion: 3, activatedAt: { toMillis: () => 1 } })));
    expect(result.current.effective).toBe('foreground');
  });

  it('reusa el último confirmado desde sessionStorage account-scoped al remount', () => {
    const first = renderHook(() => useNotificationAuthority('user-a'));
    act(() => runtimeListener('user-a', true).next(snap({
      authority: 'durable', configVersion: 8, activatedAt: { toMillis: () => 1 },
    })));
    expect(first.result.current.kind).toBe('durable');
    first.unmount();

    // Nuevo montaje de la misma cuenta: antes del primer snapshot reutiliza el
    // último confirmado account-scoped (durable), no compat.
    const second = renderHook(() => useNotificationAuthority('user-a'));
    expect(second.result.current).toEqual({
      kind: 'transient', effective: 'durable', reason: 'checking', writer: null,
    });
  });
});
