import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ERROR_MESSAGES, DEFAULT_CATEGORIES } from '../../config/constants';
import type { Transaction } from '../../types/finance';

// El hook usa useFirestoreData (requiere provider) y useLocalStorage.
// Los mockeamos para probar la lógica de dedup en modo guest de forma aislada.

const firestoreMock = {
  categories: [] as Array<{ id?: string; type: string; name: string }>,
  addCategory: vi.fn(),
  deleteCategory: vi.fn(),
};

vi.mock('../../contexts/FirestoreContext', () => ({
  useFirestoreData: () => firestoreMock,
}));

// useLocalStorage mockeado con un store en memoria que respeta el patrón
// [value, setter] y soporta updates funcionales.
const localStore = new Map<string, unknown>();
vi.mock('../../hooks/useLocalStorage', () => ({
  useLocalStorage: (key: string, initial: unknown) => {
    if (!localStore.has(key)) localStore.set(key, initial);
    const setter = (next: unknown) => {
      const prev = localStore.get(key);
      localStore.set(key, typeof next === 'function' ? (next as (p: unknown) => unknown)(prev) : next);
    };
    return [localStore.get(key), setter] as const;
  },
}));

import { useCategories } from '../../hooks/useCategories';

describe('useCategories — dedup normalizado (#22)', () => {
  beforeEach(() => {
    localStore.clear();
    firestoreMock.categories = [];
    vi.clearAllMocks();
  });

  const noTx: Transaction[] = [];

  it('rechaza un duplicado que difiere solo en mayúsculas', async () => {
    // 'Transporte' es una categoría por defecto de gastos
    expect(DEFAULT_CATEGORIES.expense).toContain('Transporte');

    const { result } = renderHook(() => useCategories(noTx, null));

    await expect(
      act(async () => {
        await result.current.addCategory('expense', 'transporte');
      }),
    ).rejects.toThrow(ERROR_MESSAGES.DUPLICATE_CATEGORY);
  });

  it('rechaza un duplicado que difiere solo en acentos', async () => {
    const { rerender, result } = renderHook(() => useCategories(noTx, null));

    // Añadir 'Café' primero
    await act(async () => {
      await result.current.addCategory('expense', 'Café');
    });
    rerender(); // refrescar el memo de categorías con el valor recién guardado

    // 'cafe' (sin acento, minúscula) debe considerarse duplicado
    await expect(
      act(async () => {
        await result.current.addCategory('expense', 'cafe');
      }),
    ).rejects.toThrow(ERROR_MESSAGES.DUPLICATE_CATEGORY);
  });

  it('rechaza duplicado con espacios alrededor (trim)', async () => {
    const { result } = renderHook(() => useCategories(noTx, null));

    await expect(
      act(async () => {
        await result.current.addCategory('expense', '  Transporte  ');
      }),
    ).rejects.toThrow(ERROR_MESSAGES.DUPLICATE_CATEGORY);
  });

  it('preserva el texto original al guardar (no normaliza al almacenar)', async () => {
    const { rerender, result } = renderHook(() => useCategories(noTx, null));

    await act(async () => {
      await result.current.addCategory('expense', 'Educación Física');
    });

    rerender();
    expect(result.current.categories.expense).toContain('Educación Física');
    // No debe haberse guardado en minúsculas ni sin acento
    expect(result.current.categories.expense).not.toContain('educacion fisica');
  });

  it('permite categorías genuinamente distintas', async () => {
    const { rerender, result } = renderHook(() => useCategories(noTx, null));

    await act(async () => {
      await result.current.addCategory('income', 'Arriendo Recibido');
    });

    rerender();
    expect(result.current.categories.income).toContain('Arriendo Recibido');
  });
});
