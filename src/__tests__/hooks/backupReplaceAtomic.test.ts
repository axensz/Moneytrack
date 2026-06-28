/**
 * C1-backup-atomic — En la importación con estrategia "replace" el borrado de los
 * datos viejos debe ocurrir SOLO DESPUÉS de escribir con éxito todos los nuevos
 * (write-then-delete). El código viejo borraba TODO antes de escribir, así que un
 * fallo a mitad provocaba pérdida total de datos.
 *
 * Invariantes verificadas:
 *  - "replace" OK: ningún batch.delete ocurre ANTES de escribir todo lo nuevo; los
 *    delete (de los datos VIEJOS, el swap) van DESPUÉS.
 *  - "replace" con fallo: ROLLBACK — se borran los docs NUEVOS ya escritos (auto-*)
 *    y NINGÚN dato viejo (old-*) se borra → el estado vuelve a "no pasó nada", sin
 *    duplicados huérfanos (atomicidad efectiva dentro de los límites de Firestore).
 *  - "merge" OK: nunca se ejecuta ningún delete.
 *  - "merge" con fallo: rollback de lo nuevo (no hay datos viejos que tocar).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Registro de llamadas compartido entre el mock y el test ---------------
type CallKind = 'set' | 'delete' | 'commit';
const callLog: CallKind[] = [];
// Ids de los docs borrados (para distinguir rollback de lo NUEVO (auto-*) del
// borrado de lo VIEJO (old-*) en un replace exitoso).
const deleteLog: string[] = [];

// Permite forzar que un commit concreto rechace (simula fallo a mitad de escritura).
let rejectCommitWhenSetSeen = false;

vi.mock('../../lib/firebaseDb', () => ({
  db: {},
}));

vi.mock('../../utils/toastHelpers', () => ({
  showToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('firebase/firestore', () => {
  // collection(db, path) -> { path }
  const collection = (_db: unknown, path: string) => ({ path });
  // doc(db, path, id) o doc(collectionRef) -> { id }
  let autoId = 0;
  const doc = (...args: unknown[]) => {
    if (args.length >= 3) {
      // doc(db, path, id)
      return { id: args[2] as string };
    }
    // doc(collectionRef) -> id autogenerado
    autoId += 1;
    return { id: `auto-${autoId}` };
  };

  // getDocs(collectionRef) -> snapshot con docs existentes (datos viejos)
  const getDocs = vi.fn(async (ref: { path: string }) => {
    // Simulamos que cada colección del usuario ya tiene 1 documento viejo.
    const existing: Record<string, string[]> = {};
    const id = ref.path.includes('/transactions')
      ? 'old-tx'
      : ref.path.includes('/accounts')
        ? 'old-acc'
        : 'old-cat';
    void existing;
    return { docs: [{ id }] };
  });

  const writeBatch = () => {
    let sawSet = false;
    return {
      set: vi.fn(() => {
        callLog.push('set');
        sawSet = true;
      }),
      delete: vi.fn((ref: { id: string }) => {
        callLog.push('delete');
        deleteLog.push(ref.id);
      }),
      commit: vi.fn(async () => {
        callLog.push('commit');
        if (rejectCommitWhenSetSeen && sawSet) {
          throw new Error('Simulated Firestore write failure mid-import');
        }
      }),
    };
  };

  return {
    collection,
    doc,
    getDocs,
    writeBatch,
    // El hook importa el tipo DocumentReference (solo tipo, no runtime), no hace falta.
  };
});

import { useBackup } from '../../hooks/useBackup';
import type { BackupData } from '../../types/finance';

// --- Helpers ---------------------------------------------------------------
const BACKUP: BackupData = {
  version: '1.0',
  exportDate: '2026-01-01T00:00:00.000Z',
  accounts: [
    // @ts-expect-error tipo simplificado para el test
    { id: 'a1', name: 'Cuenta', type: 'cash', balance: 0, currency: 'COP', color: '#000' },
  ],
  categories: {
    expense: ['Comida', 'Transporte'],
    income: ['Salario'],
  },
  transactions: [
    {
      id: 't1',
      type: 'expense',
      amount: 100,
      category: 'Comida',
      description: 'Café',
      date: new Date('2026-01-01'),
      paid: true,
      accountId: 'a1',
    },
  ],
};

function makeFile(data: unknown): File {
  return {
    text: async () => JSON.stringify(data),
  } as unknown as File;
}

const hookProps = {
  transactions: [],
  accounts: [],
  categories: { expense: [], income: [] },
  userId: 'user-1',
  refreshData: vi.fn(async () => {}),
};

function firstIndexOf(kind: CallKind): number {
  return callLog.indexOf(kind);
}
function lastIndexOf(kind: CallKind): number {
  return callLog.lastIndexOf(kind);
}

describe('C1 — backup replace: write-then-delete', () => {
  beforeEach(() => {
    callLog.length = 0;
    deleteLog.length = 0;
    rejectCommitWhenSetSeen = false;
    vi.clearAllMocks();
  });

  it('replace: TODOS los set ocurren ANTES de cualquier delete', async () => {
    const { result } = renderHook(() => useBackup({ ...hookProps }));

    await act(async () => {
      await result.current.importData(makeFile(BACKUP), 'replace');
    });

    expect(callLog).toContain('set');
    expect(callLog).toContain('delete');

    // El último set debe ir antes del primer delete: no se borró nada
    // hasta haber terminado de escribir lo nuevo.
    const lastSet = lastIndexOf('set');
    const firstDelete = firstIndexOf('delete');
    expect(lastSet).toBeGreaterThanOrEqual(0);
    expect(firstDelete).toBeGreaterThanOrEqual(0);
    expect(lastSet).toBeLessThan(firstDelete);

    // Los borrados son los datos VIEJOS (el swap), no un rollback de lo nuevo.
    expect(deleteLog.some(id => id.startsWith('old-'))).toBe(true);
    expect(deleteLog.some(id => id.startsWith('auto-'))).toBe(false);
  });

  it('replace: si una escritura falla, ROLLBACK de lo nuevo y los datos viejos sobreviven', async () => {
    rejectCommitWhenSetSeen = true; // cualquier commit con sets previos rechaza
    const { result } = renderHook(() => useBackup({ ...hookProps }));

    await act(async () => {
      // importData captura el error internamente (try/catch -> toast.error)
      await result.current.importData(makeFile(BACKUP), 'replace');
    });

    // Hubo intento de escritura...
    expect(callLog).toContain('set');
    // ...y un ROLLBACK que borró docs NUEVOS (auto-*)...
    expect(deleteLog.some(id => id.startsWith('auto-'))).toBe(true);
    // ...pero NINGÚN dato viejo (old-*) se borró → el estado vuelve a "no pasó nada".
    expect(deleteLog.some(id => id.startsWith('old-'))).toBe(false);
  });

  it('merge: nunca se ejecuta ningún delete', async () => {
    const { result } = renderHook(() => useBackup({ ...hookProps }));

    await act(async () => {
      await result.current.importData(makeFile(BACKUP), 'merge');
    });

    expect(callLog).toContain('set');
    expect(callLog).not.toContain('delete');
  });

  it('merge: si una escritura falla, ROLLBACK de lo nuevo (no hay datos viejos que borrar)', async () => {
    rejectCommitWhenSetSeen = true;
    const { result } = renderHook(() => useBackup({ ...hookProps }));

    await act(async () => {
      await result.current.importData(makeFile(BACKUP), 'merge');
    });

    expect(deleteLog.some(id => id.startsWith('auto-'))).toBe(true);
    expect(deleteLog.some(id => id.startsWith('old-'))).toBe(false);
  });
});
