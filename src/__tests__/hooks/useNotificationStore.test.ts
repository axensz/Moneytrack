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
  onSnapshot: vi.fn(),
  doc: (_db: unknown, path: string, id?: string) => ({ __path: id ? `${path}/${id}` : path }),
  deleteDoc: (ref: unknown) => M.deleteDoc(ref),
  updateDoc: (ref: unknown, data: unknown) => M.updateDoc(ref, data),
  setDoc: (ref: unknown, data: unknown) => M.setDoc(ref, data),
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

const unreadCount = (notifications: Notification[]) =>
  notifications.filter((notification) => !notification.isRead).length;

const firestorePage = (notifications: Notification[]) => ({
  docs: notifications.map((notification) => ({
    id: notification.id,
    data: () => ({
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    }),
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
});
