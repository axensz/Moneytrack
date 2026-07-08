import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Notification } from '../../types/finance';

const M = vi.hoisted(() => ({
  deleteDoc: vi.fn<(ref: unknown) => Promise<void>>(async () => undefined),
  updateDoc: vi.fn<(ref: unknown, data: unknown) => Promise<void>>(async () => undefined),
  setDoc: vi.fn<(ref: unknown, data: unknown) => Promise<void>>(async () => undefined),
  batchDelete: vi.fn<(ref: unknown) => void>(() => undefined),
  batchUpdate: vi.fn<(ref: unknown, data: unknown) => void>(() => undefined),
  batchCommit: vi.fn(async () => undefined),
}));

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __collection: path }),
  query: (...args: unknown[]) => ({ __query: args }),
  orderBy: (...args: unknown[]) => ({ __orderBy: args }),
  limit: (n: number) => ({ __limit: n }),
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

const makeNotification = (id: string, isRead = false): Notification => ({
  id,
  type: 'info',
  title: `Notificacion ${id}`,
  message: 'Mensaje',
  severity: 'info',
  isRead,
  createdAt: new Date('2026-07-08T12:00:00'),
});

const unreadCount = (notifications: Notification[]) =>
  notifications.filter((notification) => !notification.isRead).length;

describe('useNotificationStore - actualizacion optimista con datos externos', () => {
  beforeEach(() => {
    localStorage.clear();
    M.deleteDoc.mockClear();
    M.updateDoc.mockClear();
    M.setDoc.mockClear();
    M.batchDelete.mockClear();
    M.batchUpdate.mockClear();
    M.batchCommit.mockClear();
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

    expect(result.current.notifications).toHaveLength(3);

    await act(async () => {
      await result.current.clearAll();
    });

    expect(result.current.notifications).toEqual([]);
    expect(unreadCount(result.current.notifications)).toBe(0);
    expect(M.batchDelete).toHaveBeenCalledTimes(3);
    expect(M.batchCommit).toHaveBeenCalledTimes(1);
  });
});
