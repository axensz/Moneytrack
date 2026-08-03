import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Notification } from '../../types/finance';

const M = vi.hoisted(() => ({
  deleteDoc: vi.fn<(ref: unknown) => Promise<void>>(async () => undefined),
  updateDoc: vi.fn<(ref: unknown, data: unknown) => Promise<void>>(async () => undefined),
  setDoc: vi.fn<(ref: unknown, data: unknown) => Promise<void>>(async () => undefined),
  batchDelete: vi.fn<(ref: unknown) => void>(() => undefined),
  batchUpdate: vi.fn<(ref: unknown, data: unknown) => void>(() => undefined),
  batchCommit: vi.fn(async () => undefined),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __collection: path }),
  query: (...args: unknown[]) => ({ __query: args }),
  orderBy: (...args: unknown[]) => ({ __orderBy: args }),
  limit: (n: number) => ({ __limit: n }),
  documentId: () => '__name__',
  startAfter: (cursor: unknown) => ({ __startAfter: cursor }),
  getDocs: (queryRef: unknown) => M.getDocs(queryRef),
  getDoc: (ref: unknown) => M.getDoc(ref),
  onSnapshot: (...args: unknown[]) => M.onSnapshot(...args),
  doc: (_db: unknown, path: string, id?: string) => ({ __path: id ? `${path}/${id}` : path }),
  deleteDoc: (ref: unknown) => M.deleteDoc(ref),
  updateDoc: (ref: unknown, data: unknown) => M.updateDoc(ref, data),
  setDoc: (ref: unknown, data: unknown) => M.setDoc(ref, data),
  runTransaction: (database: unknown, update: unknown) => M.runTransaction(database, update),
  writeBatch: () => ({
    delete: (ref: unknown) => M.batchDelete(ref),
    update: (ref: unknown, data: unknown) => M.batchUpdate(ref, data),
    commit: () => M.batchCommit(),
  }),
}));
vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { useNotificationStore } from '../../hooks/useNotificationStore';

const makeNotification = (
  id: string,
  isRead = false,
  createdAt = new Date('2099-07-08T12:00:00')
): Notification => ({
  id,
  type: 'info',
  title: `Notificacion ${id}`,
  message: 'Mensaje',
  severity: 'info',
  isRead,
  createdAt,
});

const makeVersionedNotification = (
  revision: number,
  overrides: Partial<Notification> = {}
): Notification => ({
  ...makeNotification('event-recurring-rent-2026-08', revision === 1),
  schemaVersion: 2,
  eventKey: 'recurring:rent:2026-08',
  revision,
  stage: revision === 1 ? 'd3' : 'd1',
  stageWindow: revision === 1 ? 'd3' : 'd1',
  lifecycleStatus: 'active',
  ...overrides,
});

const unreadCount = (notifications: Notification[]) =>
  notifications.filter((notification) => !notification.isRead).length;

const firestorePage = (notifications: Notification[]) => ({
  docs: notifications.map((notification) => ({
    id: notification.id,
    data: () => notification,
  })),
});

async function finishInitialPrune() {
  await waitFor(() => expect(M.getDocs).toHaveBeenCalledTimes(1));
  M.getDocs.mockClear();
  M.batchDelete.mockClear();
  M.batchUpdate.mockClear();
  M.batchCommit.mockClear();
}

describe('useNotificationStore - actualizacion optimista con datos externos', () => {
  beforeEach(() => {
    localStorage.clear();
    M.deleteDoc.mockClear();
    M.updateDoc.mockClear();
    M.setDoc.mockClear();
    M.batchDelete.mockClear();
    M.batchUpdate.mockClear();
    M.batchCommit.mockClear();
    M.getDocs.mockReset();
    M.getDocs.mockResolvedValue(firestorePage([]));
    M.getDoc.mockReset();
    M.getDoc.mockResolvedValue({ exists: () => false, data: () => undefined });
    M.runTransaction.mockReset();
    M.onSnapshot.mockReset();
    M.onSnapshot.mockReturnValue(vi.fn());
    M.runTransaction.mockImplementation(async (_database, update: (transaction: {
      get: (ref: unknown) => Promise<unknown>;
      set: (ref: unknown, value: unknown) => void;
      update: (ref: unknown, value: unknown) => void;
    }) => Promise<unknown>) => update({
      get: (ref) => M.getDoc(ref),
      set: (ref, value) => { void M.setDoc(ref, value); },
      update: (ref, value) => { void M.updateDoc(ref, value); },
    }));
  });

  it('descuenta una notificacion borrada del conteo sin esperar otro snapshot', async () => {
    const externalNotifications = [
      makeNotification('n1'),
      makeNotification('n2'),
      makeNotification('n3'),
      makeNotification('n4'),
    ];
    const { result } = renderHook(() => useNotificationStore('user-1', externalNotifications));

    expect(unreadCount(result.current.notifications)).toBe(4);

    await act(async () => {
      await result.current.deleteNotification('n1');
    });

    expect(result.current.notifications.map((notification) => notification.id)).toEqual(['n2', 'n3', 'n4']);
    expect(unreadCount(result.current.notifications)).toBe(3);
    expect(M.deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('limpia todas las notificaciones externas de inmediato', async () => {
    const externalNotifications = [
      makeNotification('n1'),
      makeNotification('n2'),
      makeNotification('n3', true),
    ];
    const { result } = renderHook(() => useNotificationStore('user-1', externalNotifications));
    await finishInitialPrune();
    M.getDocs.mockResolvedValueOnce(firestorePage(externalNotifications));

    expect(result.current.notifications).toHaveLength(3);

    await act(async () => {
      await result.current.clearAll();
    });

    expect(result.current.notifications).toEqual([]);
    expect(unreadCount(result.current.notifications)).toBe(0);
    expect(M.batchDelete).toHaveBeenCalledTimes(3);
    expect(M.batchCommit).toHaveBeenCalledTimes(1);
  });

  it('limpia tambien las notificaciones autenticadas posteriores al limite visible de 100', async () => {
    const storedNotifications = Array.from({ length: 601 }, (_, index) =>
      makeNotification(`n${index + 1}`)
    );
    const { result } = renderHook(() =>
      useNotificationStore('user-1', storedNotifications.slice(0, 100))
    );
    await finishInitialPrune();
    M.getDocs
      .mockResolvedValueOnce(firestorePage(storedNotifications.slice(0, 499)))
      .mockResolvedValueOnce(firestorePage(storedNotifications.slice(499)));

    await act(async () => {
      await result.current.clearAll();
    });

    expect(result.current.notifications).toEqual([]);
    expect(M.getDocs).toHaveBeenCalledTimes(2);
    expect(M.batchDelete).toHaveBeenCalledTimes(601);
    expect(M.batchCommit).toHaveBeenCalledTimes(16);
  });

  it('marca las antiguas no leidas aunque las 100 visibles ya esten leidas', async () => {
    const visibleNotifications = Array.from({ length: 100 }, (_, index) =>
      makeNotification(`n${index + 1}`, true)
    );
    const hiddenNotifications = Array.from({ length: 450 }, (_, index) =>
      makeNotification(`n${index + 101}`)
    );
    const storedNotifications = [...visibleNotifications, ...hiddenNotifications];
    const { result } = renderHook(() =>
      useNotificationStore('user-1', visibleNotifications)
    );
    await finishInitialPrune();
    M.getDocs
      .mockResolvedValueOnce(firestorePage(storedNotifications.slice(0, 499)))
      .mockResolvedValueOnce(firestorePage(storedNotifications.slice(499)));

    await act(async () => {
      await result.current.markAllAsRead();
    });

    expect(result.current.notifications.every((notification) => notification.isRead)).toBe(true);
    expect(M.getDocs).toHaveBeenCalledTimes(2);
    expect(M.batchUpdate).toHaveBeenCalledTimes(450);
    expect(M.batchCommit).toHaveBeenCalledTimes(12);
  });

  it('poda notificaciones antiguas fuera de la ventana visible de 100', async () => {
    const oldNotifications = Array.from({ length: 550 }, (_, index) =>
      makeNotification(`old-${index + 1}`, false, new Date('2000-01-01T00:00:00'))
    );
    const freshNotifications = Array.from({ length: 100 }, (_, index) =>
      makeNotification(`fresh-${index + 1}`)
    );
    const storedNotifications = [...oldNotifications, ...freshNotifications];
    M.getDocs
      .mockResolvedValueOnce(firestorePage(storedNotifications.slice(0, 499)))
      .mockResolvedValueOnce(firestorePage(storedNotifications.slice(499)));

    renderHook(() => useNotificationStore('user-1', freshNotifications));

    await waitFor(() => {
      expect(M.batchDelete).toHaveBeenCalledTimes(550);
      expect(M.batchCommit).toHaveBeenCalledTimes(14);
    });
    expect(M.getDocs).toHaveBeenCalledTimes(2);
  });

  it('conserva la revisión más alta y hace visible la siguiente tras un descarte', async () => {
    const dismissed = makeVersionedNotification(2, {
      isRead: true,
      readRevision: 2,
      dismissedRevision: 2,
    });
    localStorage.setItem('notifications', JSON.stringify([dismissed]));
    const { result } = renderHook(() => useNotificationStore(null));

    let staleCreated: boolean | undefined;
    await act(async () => {
      staleCreated = await result.current.addNotification(makeVersionedNotification(1));
    });

    expect(staleCreated).toBe(false);
    expect(result.current.notifications).toEqual([]);

    let advancedCreated: boolean | undefined;
    await act(async () => {
      advancedCreated = await result.current.addNotification(
        makeVersionedNotification(3, { stage: 'due', stageWindow: 'due' })
      );
    });

    expect(advancedCreated).toBe(true);
    expect(result.current.notifications).toMatchObject([{
      revision: 3,
      isRead: false,
    }]);
    expect(result.current.notifications[0].readRevision).toBeUndefined();
    expect(result.current.notifications[0].dismissedRevision).toBeUndefined();
  });

  it('reserves the higher revision before persistence so a concurrent lower revision cannot degrade the document', async () => {
    const persisted = makeVersionedNotification(2);
    const r4 = makeVersionedNotification(4, { stage: 'overdue', stageWindow: 'overdue:0' });
    const r3 = makeVersionedNotification(3, { stage: 'due', stageWindow: 'due' });
    const writes: Notification[] = [];
    let releaseTransaction: (() => Promise<void>) | undefined;

    M.runTransaction.mockImplementation((_database, update: (transaction: {
      get: () => Promise<{ exists: () => boolean; data: () => Notification }>;
      set: (_ref: unknown, value: Notification) => void;
    }) => Promise<unknown>) => new Promise((resolve, reject) => {
      releaseTransaction = async () => {
        try {
          resolve(await update({
            get: async () => ({ exists: () => true, data: () => persisted }),
            set: (_ref, value) => { writes.push(value); },
          }));
        } catch (error) {
          reject(error);
        }
      };
    }));

    const { result } = renderHook(() => useNotificationStore('user-1', [persisted]));
    const advancing = result.current.addNotification(r4);
    await waitFor(() => expect(M.runTransaction).toHaveBeenCalledTimes(1));

    await expect(result.current.addNotification(r3)).resolves.toBe(false);
    await releaseTransaction?.();
    await expect(advancing).resolves.toBe(true);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ revision: 4, stageWindow: 'overdue:0' });
  });

  it.each([
    ['r4', 'r5'],
    ['r5', 'r4'],
  ] as const)('releases only the failed reservation when %s fails before %s', async (firstFailed, secondFailed) => {
    const persisted = makeVersionedNotification(2);
    const r4 = makeVersionedNotification(4, { stage: 'overdue', stageWindow: 'overdue:0' });
    const r5 = makeVersionedNotification(5, { stage: 'overdue', stageWindow: 'overdue:1' });
    const writes: Notification[] = [];
    const pendingTransactions: Array<{
      resolve: () => Promise<void>;
      reject: (error: Error) => void;
    }> = [];

    M.runTransaction.mockImplementation((_database, update: (transaction: {
      get: () => Promise<{ exists: () => boolean; data: () => Notification }>;
      set: (_ref: unknown, value: Notification) => void;
    }) => Promise<unknown>) => new Promise((resolve, reject) => {
      pendingTransactions.push({
        resolve: async () => {
          try {
            resolve(await update({
              get: async () => ({ exists: () => true, data: () => persisted }),
              set: (_ref, value) => { writes.push(value); },
            }));
          } catch (error) {
            reject(error);
          }
        },
        reject,
      });
    }));

    const { result } = renderHook(() => useNotificationStore('user-1', [persisted]));
    const r4Write = result.current.addNotification(r4);
    const r5Write = result.current.addNotification(r5);
    await waitFor(() => expect(pendingTransactions).toHaveLength(2));

    const firstIndex = firstFailed === 'r4' ? 0 : 1;
    const secondIndex = secondFailed === 'r4' ? 0 : 1;
    const firstWrite = firstFailed === 'r4' ? r4Write : r5Write;
    const secondWrite = secondFailed === 'r4' ? r4Write : r5Write;
    const secondCandidate = secondFailed === 'r4' ? r4 : r5;

    pendingTransactions[firstIndex].reject(new Error(`offline ${firstFailed}`));
    await expect(firstWrite).rejects.toThrow(`offline ${firstFailed}`);

    await expect(result.current.addNotification(secondCandidate)).resolves.toBe(false);

    pendingTransactions[secondIndex].reject(new Error(`offline ${secondFailed}`));
    await expect(secondWrite).rejects.toThrow(`offline ${secondFailed}`);

    const retryR4 = result.current.addNotification(r4);
    await waitFor(() => expect(pendingTransactions).toHaveLength(3));
    await pendingTransactions[2].resolve();
    await expect(retryR4).resolves.toBe(true);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ revision: 4, stageWindow: 'overdue:0' });
  });

  it('keeps the confirmed higher revision when r5 succeeds and the pending r4 write fails', async () => {
    const persisted = makeVersionedNotification(2);
    const r4 = makeVersionedNotification(4, { stage: 'overdue', stageWindow: 'overdue:0' });
    const r5 = makeVersionedNotification(5, { stage: 'overdue', stageWindow: 'overdue:1' });
    const writes: Notification[] = [];
    const pendingTransactions: Array<{
      resolve: () => Promise<void>;
      reject: (error: Error) => void;
    }> = [];

    M.runTransaction.mockImplementation((_database, update: (transaction: {
      get: () => Promise<{ exists: () => boolean; data: () => Notification }>;
      set: (_ref: unknown, value: Notification) => void;
    }) => Promise<unknown>) => new Promise((resolve, reject) => {
      pendingTransactions.push({
        resolve: async () => {
          try {
            resolve(await update({
              get: async () => ({ exists: () => true, data: () => persisted }),
              set: (_ref, value) => { writes.push(value); },
            }));
          } catch (error) {
            reject(error);
          }
        },
        reject,
      });
    }));

    const { result } = renderHook(() => useNotificationStore('user-1', [persisted]));
    const r4Write = result.current.addNotification(r4);
    const r5Write = result.current.addNotification(r5);
    await waitFor(() => expect(pendingTransactions).toHaveLength(2));

    await pendingTransactions[1].resolve();
    await expect(r5Write).resolves.toBe(true);

    pendingTransactions[0].reject(new Error('offline r4'));
    await expect(r4Write).rejects.toThrow('offline r4');
    await expect(result.current.addNotification(r4)).resolves.toBe(false);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ revision: 5, stageWindow: 'overdue:1' });
  });

  it('normaliza el candidato v2 inicial a revisión 1 en vez de tratarlo como legacy', async () => {
    const candidate = makeVersionedNotification(1);
    delete candidate.revision;
    localStorage.setItem('notifications', '[]');
    const { result } = renderHook(() => useNotificationStore(null));

    let created: boolean | undefined;
    await act(async () => {
      created = await result.current.addNotification(candidate);
    });

    expect(created).toBe(true);
    expect(result.current.notifications).toMatchObject([{
      id: 'event:recurring%3Arent%3A2026-08',
      schemaVersion: 2,
      revision: 1,
    }]);
  });

  it('oculta de inmediato el descarte v2 externo y no conserva lectura al avanzar', async () => {
    const current = makeVersionedNotification(2);
    const { result, rerender } = renderHook(
      ({ notifications }) => useNotificationStore('user-1', notifications),
      { initialProps: { notifications: [current] } }
    );

    await act(async () => {
      await result.current.updateNotification('event-recurring-rent-2026-08', {
        isRead: true,
        readRevision: 2,
      });
    });
    expect(result.current.notifications[0]).toMatchObject({ isRead: true, readRevision: 2 });

    rerender({ notifications: [makeVersionedNotification(3)] });
    expect(result.current.notifications[0]).toMatchObject({ isRead: false, revision: 3 });

    await act(async () => {
      await result.current.updateNotification('event-recurring-rent-2026-08', {
        dismissedRevision: 3,
        dismissedAt: new Date(),
      });
    });

    expect(result.current.notifications).toEqual([]);
    expect(M.updateDoc).toHaveBeenLastCalledWith(
      { __path: 'users/user-1/notifications/event-recurring-rent-2026-08' },
      expect.objectContaining({ dismissedRevision: 3 })
    );
  });

  it('no elimina directamente un evento v2 aunque se invoque la frontera store', async () => {
    const versioned = makeVersionedNotification(3);
    M.getDoc.mockResolvedValue({ exists: () => true, data: () => versioned });
    const { result } = renderHook(() => useNotificationStore('user-1', [versioned]));

    await act(async () => {
      await result.current.deleteNotification('event-recurring-rent-2026-08');
    });

    expect(M.deleteDoc).not.toHaveBeenCalled();
    expect(M.updateDoc).toHaveBeenCalledWith(
      { __path: 'users/user-1/notifications/event-recurring-rent-2026-08' },
      expect.objectContaining({ dismissedRevision: 3 })
    );
  });

  it('never physically deletes a hidden v2 event and carries its expected revision to persistence', async () => {
    const hidden = makeVersionedNotification(3, { dismissedRevision: 3 });
    M.getDoc.mockResolvedValue({ exists: () => true, data: () => hidden });
    const { result } = renderHook(() => useNotificationStore('user-1', [hidden]));

    expect(result.current.notifications).toEqual([]);
    await act(async () => {
      await result.current.deleteNotification('event-recurring-rent-2026-08');
    });

    expect(M.deleteDoc).not.toHaveBeenCalled();
    expect(M.getDoc).toHaveBeenCalledWith(
      { __path: 'users/user-1/notifications/event-recurring-rent-2026-08' }
    );
    expect(M.updateDoc).toHaveBeenCalledWith(
      { __path: 'users/user-1/notifications/event-recurring-rent-2026-08' },
      expect.objectContaining({ dismissedRevision: 3 })
    );
  });

  it('reads an absent document before deciding whether a physical delete is safe', async () => {
    const persisted = makeVersionedNotification(3);
    M.getDoc.mockResolvedValue({ exists: () => true, data: () => persisted });
    const { result } = renderHook(() => useNotificationStore('user-1', []));

    await act(async () => {
      await result.current.deleteNotification('event-recurring-rent-2026-08');
    });

    expect(M.deleteDoc).not.toHaveBeenCalled();
    expect(M.updateDoc).toHaveBeenCalledWith(
      { __path: 'users/user-1/notifications/event-recurring-rent-2026-08' },
      expect.objectContaining({ dismissedRevision: 3 })
    );
  });

  it('restores a local v2 dismissal when Firestore has already advanced to another revision', async () => {
    const visible = makeVersionedNotification(3, { stage: 'due', stageWindow: 'due' });
    const persisted = makeVersionedNotification(4, { stage: 'overdue', stageWindow: 'overdue:0' });
    let receiveSnapshot: ((snapshot: ReturnType<typeof firestorePage>) => void) | undefined;
    M.onSnapshot.mockImplementation((_query, receive) => {
      receiveSnapshot = receive;
      return vi.fn();
    });
    M.getDoc.mockResolvedValue({ exists: () => true, data: () => persisted });
    const { result } = renderHook(() => useNotificationStore('user-1'));

    await act(async () => {
      receiveSnapshot?.({
        docs: [{
          id: visible.id,
          data: () => ({ ...visible, createdAt: { toDate: () => visible.createdAt } }),
        }],
      } as unknown as ReturnType<typeof firestorePage>);
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.deleteNotification('event-recurring-rent-2026-08');
    });

    expect(M.updateDoc).not.toHaveBeenCalled();
    expect(result.current.notifications).toMatchObject([{ revision: 3 }]);
  });

  it('restores a local v2 dismissal when its transaction rejects', async () => {
    const visible = makeVersionedNotification(3, { stage: 'due', stageWindow: 'due' });
    let receiveSnapshot: ((snapshot: ReturnType<typeof firestorePage>) => void) | undefined;
    M.onSnapshot.mockImplementation((_query, receive) => {
      receiveSnapshot = receive;
      return vi.fn();
    });
    M.runTransaction.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useNotificationStore('user-1'));

    await act(async () => {
      receiveSnapshot?.({
        docs: [{
          id: visible.id,
          data: () => ({ ...visible, createdAt: { toDate: () => visible.createdAt } }),
        }],
      } as unknown as ReturnType<typeof firestorePage>);
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await expect(result.current.deleteNotification('event-recurring-rent-2026-08')).rejects.toThrow('offline');
    });

    expect(result.current.notifications).toMatchObject([{ revision: 3 }]);
  });

  it('mantiene el borrado legacy, pero descarta la revisión actual de eventos v2 al limpiar todo', async () => {
    const versioned = makeVersionedNotification(3);
    const legacy = makeNotification('legacy-1');
    const { result } = renderHook(() => useNotificationStore('user-1', [versioned, legacy]));
    await finishInitialPrune();
    M.getDocs.mockResolvedValueOnce(firestorePage([versioned, legacy]));

    await act(async () => {
      await result.current.clearAll();
    });

    expect(M.batchDelete).toHaveBeenCalledTimes(1);
    expect(M.batchUpdate).toHaveBeenCalledTimes(1);
    expect(M.batchUpdate).toHaveBeenCalledWith(
      { __path: 'users/user-1/notifications/event-recurring-rent-2026-08' },
      expect.objectContaining({ dismissedRevision: 3 })
    );
  });

  it('marca una revisión v2 como leída sin preleer una revisión futura', async () => {
    const versioned = makeVersionedNotification(2);
    const { result, rerender } = renderHook(
      ({ notifications }) => useNotificationStore('user-1', notifications),
      { initialProps: { notifications: [versioned] } }
    );
    await finishInitialPrune();
    M.getDocs.mockResolvedValueOnce(firestorePage([versioned]));

    await act(async () => {
      await result.current.markAllAsRead();
    });

    expect(M.batchUpdate).toHaveBeenCalledWith(
      { __path: 'users/user-1/notifications/event-recurring-rent-2026-08' },
      { isRead: true, readRevision: 2 }
    );
    rerender({ notifications: [makeVersionedNotification(3)] });
    expect(result.current.notifications[0]).toMatchObject({ revision: 3, isRead: false });
  });
});
