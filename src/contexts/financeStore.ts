'use client';

/**
 * Store externo + selector con `useSyncExternalStore` (Q-context).
 *
 * MOTIVACIÓN:
 * `FinanceContext` exponía un único `value` monolítico; cualquier cambio creaba
 * un `value` nuevo y re-renderizaba a TODOS los consumidores de `useFinance()`.
 * Aquí se introduce un store externo suscribible por slice: cada consumidor se
 * re-renderiza solo cuando cambia SU selección (vía `useStoreSelector` +
 * igualdad shallow). El motor de datos/CRUD (los 8 hooks de FinanceProvider) NO
 * cambia — esto es solo la capa de exposición/lectura.
 *
 * React 19 trae `useSyncExternalStore` nativo, así que el selector con caché +
 * igualdad se escribe a mano (mismo patrón que el shim
 * `use-sync-external-store/with-selector`, sin la dependencia).
 */

import { useRef, useCallback, useSyncExternalStore } from 'react';

type Listener = () => void;

export interface ExternalStore<T> {
  /** Devuelve el snapshot actual (referencialmente estable hasta `setSnapshot`). */
  getSnapshot: () => T;
  /** Registra un listener; devuelve la función para desuscribir. */
  subscribe: (listener: Listener) => () => void;
  /** Reemplaza el snapshot y notifica a los listeners si la referencia cambió. */
  setSnapshot: (next: T) => void;
}

/**
 * Crea un store externo mínimo: un snapshot mutable + un conjunto de listeners.
 * `setSnapshot` es no-op si la referencia no cambió (evita notificaciones vacías).
 */
export function createStore<T>(initial: T): ExternalStore<T> {
  let snapshot = initial;
  const listeners = new Set<Listener>();

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setSnapshot: (next: T) => {
      if (Object.is(next, snapshot)) return;
      snapshot = next;
      listeners.forEach((l) => l());
    },
  };
}

/**
 * Igualdad shallow de un nivel. Para los objetos de slice de dominio: los
 * callbacks (useCallback) y los arrays/stats de los hooks ya son referencias
 * estables, así que cuando otro dominio cambia esta comparación devuelve `true`
 * y el consumidor NO se re-renderiza.
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  for (const key of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Suscripción por selección sobre `useSyncExternalStore` nativo, con caché.
 *
 * Cachea `{ snap, sel }`: si el snapshot del store no cambió de referencia,
 * devuelve la selección previa sin recomputar. Si cambió, recomputa el selector
 * y, si la nueva selección es `isEqual` a la previa, DEVUELVE LA REFERENCIA
 * PREVIA → React hace bail-out y no re-renderiza. Sin la caché, un selector que
 * devuelve un objeto nuevo cada llamada causaría re-render infinito.
 *
 * `selector` e `isEqual` se asumen estables (defínelos a nivel de módulo o con
 * useCallback); el hook los lee vía ref para no recrear `getSelection`.
 */
export function useStoreSelector<T, S>(
  store: ExternalStore<T>,
  selector: (snapshot: T) => S,
  isEqual: (a: S, b: S) => boolean = shallowEqual as (a: S, b: S) => boolean
): S {
  const cacheRef = useRef<{ snap: T; sel: S } | null>(null);
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);
  selectorRef.current = selector;
  isEqualRef.current = isEqual;

  const getSelection = useCallback((): S => {
    const snap = store.getSnapshot();
    const prev = cacheRef.current;
    if (prev && Object.is(prev.snap, snap)) {
      return prev.sel;
    }
    const nextSel = selectorRef.current(snap);
    if (prev && isEqualRef.current(prev.sel, nextSel)) {
      // Selección equivalente → conservar la referencia previa (bail-out).
      cacheRef.current = { snap, sel: prev.sel };
      return prev.sel;
    }
    cacheRef.current = { snap, sel: nextSel };
    return nextSel;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}
