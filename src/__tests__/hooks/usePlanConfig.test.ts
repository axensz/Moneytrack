/**
 * usePlanConfig — carga del plan en modo invitado y manejo de error de lectura.
 *
 * Bug (#5 re-auditoría 2026-06-12): la hidratación de useLocalStorage es
 * asíncrona (post-mount), pero el efecto de carga solo dependía de [userId]
 * → el plan guardado de un invitado NUNCA se cargaba al recargar la app.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  getDocImpl: vi.fn(async (_ref: unknown) => ({ exists: () => false, data: () => undefined as unknown })),
  loggedErrors: [] as unknown[],
}));

vi.mock('../../lib/firebase', () => ({ db: { __db: true } }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ __path: path }),
  getDoc: (ref: unknown) => M.getDocImpl(ref),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
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
});

describe('usePlanConfig — modo invitado', () => {
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
