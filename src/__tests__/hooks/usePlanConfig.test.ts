/**
 * usePlanConfig — carga del plan en modo invitado y manejo de error de lectura.
 *
 * Bug (#5 re-auditoría 2026-06-12): la hidratación de useLocalStorage es
 * asíncrona (post-mount), pero el efecto de carga solo dependía de [userId]
 * → el plan guardado de un invitado NUNCA se cargaba al recargar la app.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  getDocImpl: vi.fn<
    (ref: unknown) => Promise<{ exists: () => boolean; data: () => unknown }>
  >(async () => ({
    exists: () => false,
    data: () => undefined,
  })),
  loggedErrors: [] as unknown[],
  setDocImpl: vi.fn<() => Promise<void>>(),
  deleteDocImpl: vi.fn<() => Promise<void>>(),
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ __path: path }),
  getDoc: (ref: unknown) => M.getDocImpl(ref),
  setDoc: () => M.setDocImpl(),
  deleteDoc: () => M.deleteDocImpl(),
}));
vi.mock('../../utils/logger', () => ({
  logger: { error: (...args: unknown[]) => M.loggedErrors.push(args), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { usePlanConfig } from '../../hooks/usePlanConfig';

beforeEach(() => {
  localStorage.clear();
  M.loggedErrors.length = 0;
  M.getDocImpl.mockReset();
  M.getDocImpl.mockImplementation(async () => ({ exists: () => false, data: () => undefined }));
  M.setDocImpl.mockReset().mockResolvedValue(undefined);
  M.deleteDocImpl.mockReset().mockResolvedValue(undefined);
});

afterEach(() => { vi.restoreAllMocks(); });

describe('usePlanConfig — persistencia confirmada', () => {
  const previous = { startMonth: '2026-01', declaredIncome: 1_000_000 };
  const changed = { startMonth: '2026-01', declaredIncome: 2_000_000 };

  beforeEach(() => {
    M.getDocImpl.mockResolvedValue({ exists: () => true, data: () => previous });
  });

  it.each(['save', 'clear'] as const)('conserva el plan si %s es rechazado', async operation => {
    const write = operation === 'save' ? M.setDocImpl : M.deleteDocImpl;
    write.mockRejectedValueOnce(new Error('Permiso denegado'));
    const { result } = renderHook(() => usePlanConfig('A'));
    await waitFor(() => expect(result.current.config).toEqual(previous));

    await act(async () => {
      const promise = operation === 'save'
        ? result.current.saveConfig(changed)
        : result.current.clearConfig();
      await expect(promise).rejects.toThrow('Permiso denegado');
    });

    expect(result.current.config).toEqual(previous);
  });

  it.each(['save', 'clear'] as const)('espera la confirmación de %s antes de cambiar el plan', async operation => {
    let resolve!: () => void;
    const write = operation === 'save' ? M.setDocImpl : M.deleteDocImpl;
    write.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    const { result } = renderHook(() => usePlanConfig('A'));
    await waitFor(() => expect(result.current.config).toEqual(previous));

    let pending!: Promise<unknown>;
    act(() => {
      pending = operation === 'save'
        ? result.current.saveConfig(changed)
        : result.current.clearConfig();
    });
    expect(result.current.config).toEqual(previous);

    await act(async () => {
      resolve();
      await pending;
    });
    expect(result.current.config).toEqual(operation === 'save' ? changed : null);
  });

  it.each([
    ['save', 'resolve'], ['clear', 'resolve'], ['save', 'reject'], ['clear', 'reject'],
  ] as const)('descarta el resultado tardío de %s (%s) al cambiar de sesión', async (operation, outcome) => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const write = operation === 'save' ? M.setDocImpl : M.deleteDocImpl;
    write.mockReturnValueOnce(new Promise<void>((done, fail) => { resolve = done; reject = fail; }));
    const { result, rerender } = renderHook(({ uid }) => usePlanConfig(uid), {
      initialProps: { uid: 'A' },
    });
    await waitFor(() => expect(result.current.config).toEqual(previous));

    let pending!: Promise<unknown>;
    act(() => {
      pending = operation === 'save'
        ? result.current.saveConfig(changed)
        : result.current.clearConfig();
    });
    rerender({ uid: 'B' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ uid: 'A' });
    await waitFor(() => expect(result.current.config).toEqual(previous));

    await act(async () => {
      if (outcome === 'resolve') resolve();
      else reject(new Error('Permiso denegado en la sesión anterior'));
      await expect(pending).resolves.toBe(false);
    });
    expect(result.current.config).toEqual(previous);
  });
});

describe('usePlanConfig — modo invitado', () => {
  it.each([
    ['save', 'QuotaExceededError'], ['clear', 'QuotaExceededError'],
    ['save', 'SecurityError'], ['clear', 'SecurityError'],
  ] as const)('conserva el plan local si %s falla con %s', async (operation, errorName) => {
    const previous = { startMonth: '2026-01', declaredIncome: 1_000_000 };
    localStorage.setItem('financialPlanConfig', JSON.stringify(previous));
    const { result } = renderHook(() => usePlanConfig(null));
    await waitFor(() => expect(result.current.config).toEqual(previous));
    const failure = new DOMException('No se pudo persistir', errorName);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw failure; });

    await act(async () => {
      const pending = operation === 'save'
        ? result.current.saveConfig({ ...previous, declaredIncome: 2_000_000 })
        : result.current.clearConfig();
      await expect(pending).rejects.toBe(failure);
    });

    expect(result.current.config).toEqual(previous);
    expect(JSON.parse(localStorage.getItem('financialPlanConfig')!)).toEqual(previous);
  });

  it('carga el plan guardado en localStorage tras la hidratación asíncrona', async () => {
    localStorage.setItem(
      'financialPlanConfig',
      JSON.stringify({ startMonth: '2026-01', declaredIncome: 3_000_000 })
    );

    const { result } = renderHook(() => usePlanConfig(null));

    await waitFor(() => {
      expect(result.current.config).toEqual({ startMonth: '2026-01', declaredIncome: 3_000_000 });
    });
    expect(result.current.loading).toBe(false);
  });

  it('sin plan guardado: config null y loading false', async () => {
    const { result } = renderHook(() => usePlanConfig(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config).toBeNull();
  });
});

describe('usePlanConfig — no filtra el plan entre cuentas (#6)', () => {
  it('al cerrar sesión (userId→null) sin plan de invitado, no conserva el plan del usuario anterior', async () => {
    M.getDocImpl.mockImplementation(async () => ({
      exists: () => true,
      data: () => ({ startMonth: '2026-01', declaredIncome: 5_000_000 }),
    }));
    const { result, rerender } = renderHook(({ uid }) => usePlanConfig(uid), {
      initialProps: { uid: 'A' as string | null },
    });
    await waitFor(() =>
      expect(result.current.config).toEqual({ startMonth: '2026-01', declaredIncome: 5_000_000 })
    );

    rerender({ uid: null });
    await waitFor(() => expect(result.current.config).toBeNull());
  });

  it('al entrar a una cuenta sin plan (doc inexistente), no conserva el plan del usuario anterior', async () => {
    // A tiene plan; B no.
    M.getDocImpl.mockImplementation(async (ref: unknown) => {
      const path = (ref as { __path?: string })?.__path ?? '';
      if (path.includes('users/A/')) {
        return { exists: () => true, data: () => ({ startMonth: '2026-01', declaredIncome: 5_000_000 }) };
      }
      return { exists: () => false, data: () => undefined };
    });
    const { result, rerender } = renderHook(({ uid }) => usePlanConfig(uid), {
      initialProps: { uid: 'A' as string },
    });
    await waitFor(() =>
      expect(result.current.config).toEqual({ startMonth: '2026-01', declaredIncome: 5_000_000 })
    );

    rerender({ uid: 'B' });
    await waitFor(() => expect(result.current.config).toBeNull());
  });
});

describe('usePlanConfig — error de lectura (autenticado)', () => {
  it('loguea el error en vez de tragarlo, y apaga loading', async () => {
    M.getDocImpl.mockImplementation(async () => {
      throw new Error('firestore caído');
    });

    const { result } = renderHook(() => usePlanConfig('u1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config).toBeNull();
    expect(M.loggedErrors.length).toBeGreaterThan(0);
  });
});
