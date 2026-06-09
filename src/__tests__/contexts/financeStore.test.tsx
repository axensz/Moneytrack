import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createStore, shallowEqual, useStoreSelector } from '../../contexts/financeStore';

describe('createStore', () => {
  it('getSnapshot devuelve el inicial y es estable hasta setSnapshot', () => {
    const initial = { a: 1 };
    const store = createStore(initial);
    expect(store.getSnapshot()).toBe(initial);
    const next = { a: 2 };
    store.setSnapshot(next);
    expect(store.getSnapshot()).toBe(next);
  });

  it('notifica a los listeners solo cuando cambia la referencia', () => {
    const store = createStore({ a: 1 });
    const listener = vi.fn();
    store.subscribe(listener);

    const next = { a: 2 };
    store.setSnapshot(next);
    expect(listener).toHaveBeenCalledTimes(1);

    // misma referencia → no notifica
    store.setSnapshot(next);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe deja de notificar', () => {
    const store = createStore({ a: 1 });
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    unsub();
    store.setSnapshot({ a: 2 });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('shallowEqual', () => {
  it('true para mismos valores de primer nivel', () => {
    const fn = () => {};
    const arr = [1, 2];
    expect(shallowEqual({ x: 1, fn, arr }, { x: 1, fn, arr })).toBe(true);
  });
  it('false si un valor de primer nivel cambia de referencia', () => {
    expect(shallowEqual({ arr: [1] }, { arr: [1] })).toBe(false); // arrays distintos
    expect(shallowEqual({ x: 1 }, { x: 2 })).toBe(false);
  });
  it('false si difiere el número de claves', () => {
    expect(shallowEqual({ x: 1 }, { x: 1, y: 2 })).toBe(false);
  });
});

describe('useStoreSelector', () => {
  it('re-renderiza SOLO cuando la selección cambia', () => {
    const store = createStore({ goals: ['g1'], debts: ['d1'] });
    const selectGoals = (s: { goals: string[]; debts: string[] }) => ({ goals: s.goals });

    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useStoreSelector(store, selectGoals);
    });

    expect(renders).toBe(1);
    expect(result.current.goals).toEqual(['g1']);

    // Cambia OTRO slice (debts) → goals igual por referencia → NO re-render.
    act(() => {
      store.setSnapshot({ goals: store.getSnapshot().goals, debts: ['d1', 'd2'] });
    });
    expect(renders).toBe(1);

    // Cambia el slice propio (goals) → re-render.
    act(() => {
      store.setSnapshot({ goals: ['g1', 'g2'], debts: store.getSnapshot().debts });
    });
    expect(renders).toBe(2);
    expect(result.current.goals).toEqual(['g1', 'g2']);
  });

  it('selector identidad re-renderiza ante cualquier cambio (back-compat useFinance)', () => {
    const store = createStore({ a: 1, b: 2 });
    const id = <T,>(s: T) => s;

    let renders = 0;
    renderHook(() => {
      renders++;
      return useStoreSelector(store, id, Object.is);
    });
    expect(renders).toBe(1);

    act(() => store.setSnapshot({ a: 1, b: 3 }));
    expect(renders).toBe(2);
  });
});
