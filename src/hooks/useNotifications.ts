/**
 * Main hook for consuming notification functionality
 * Provides unified API for components
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useNotificationStore } from './useNotificationStore';
import { useNotificationPreferences } from './useNotificationPreferences';
import { useFirestoreData } from '../contexts/FirestoreContext';
import { NotificationManager } from '../services/NotificationManager';
import { buildRecurringReminderCandidate } from '../services/PaymentMonitor';
import {
  createAuthenticatedRecurringReminderCursorStore,
  createGuestRecurringReminderCursorStore,
  findAuthenticatedRecurringReminderLifecycle,
  setForegroundReminderContext,
  type RecurringReminderCursorStore,
} from '../lib/recurringReminderCursorStore';
import { evaluateRecurringReminderCursor } from '../utils/recurringReminderCursor';
import { recurringTransactionSatisfiesCycleKey } from '../utils/recurringPayments';
import { logger } from '../utils/logger';
import type { Notification, NotificationFilter } from '../types/finance';

export function useNotifications(userId: string | null) {
  // Get centralized Firestore data to avoid separate listeners
  const firestoreData = useFirestoreData();

  // Get store and preferences — pass centralized data when authenticated
  const {
    notifications,
    loading: storeLoading,
    addNotification,
    updateNotification,
    deleteNotification,
    clearAll: storeClearAll,
    markAllAsRead: storeMarkAllAsRead,
  } = useNotificationStore(userId, userId ? firestoreData.notifications : undefined);

  const {
    preferences,
    loading: preferencesLoading,
    updatePreferences,
  } = useNotificationPreferences(userId, userId ? firestoreData.notificationPreferences : undefined);

  // ✅ FIX #1: Usar useRef para mantener instancia estable del NotificationManager
  // Esto previene el ciclo infinito de re-inicialización
  const notificationManagerRef = useRef<NotificationManager | null>(null);

  // Crear instancia solo una vez (primera renderización)
  if (!notificationManagerRef.current) {
    notificationManagerRef.current = new NotificationManager({
      addNotification,
      updateNotification,
      deleteNotification,
      clearAll: storeClearAll,
      markAllAsRead: storeMarkAllAsRead,
      notifications: [],  // Inicializar vacío
      preferences,
    });
  }

  // Actualizar deps del manager sin recrear la instancia
  // Esto permite que el manager tenga acceso a los datos actuales sin causar re-renders
  useEffect(() => {
    if (notificationManagerRef.current) {
      notificationManagerRef.current.deps = {
        addNotification,
        updateNotification,
        deleteNotification,
        clearAll: storeClearAll,
        markAllAsRead: storeMarkAllAsRead,
        notifications,
        preferences,
      };
    }
  }, [addNotification, updateNotification, deleteNotification, storeClearAll, storeMarkAllAsRead, notifications, preferences]);

  const notificationManager = notificationManagerRef.current;

  const writerPrefix = userId ? 'foreground:compat' : 'foreground:guest';
  const cursorStore = useMemo<RecurringReminderCursorStore>(() => {
    if (userId) {
      return createAuthenticatedRecurringReminderCursorStore({
        sourceNotifications: firestoreData.notifications,
        writerPrefix,
      });
    }
    if (typeof window === 'undefined') return { read: () => undefined };
    return createGuestRecurringReminderCursorStore({
      storage: window.localStorage,
      accountScope: 'guest',
      writerPrefix,
    });
  }, [userId, firestoreData.notifications, writerPrefix]);
  const timeZone = preferences.timeZone
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    ?? 'America/Bogota';

  setForegroundReminderContext(notificationManager, {
    cursorStore,
    sourceNotifications: userId ? firestoreData.notifications : notifications,
    timeZone,
    writerPrefix,
  });

  // Financial writers remain authoritative. This observer only reacts after the
  // central Firestore snapshot exposes the persisted link/unlink/delete result.
  useEffect(() => {
    if (!userId || firestoreData.loading) return;
    let cancelled = false;

    const recompute = async () => {
      const now = new Date();
      for (const payment of firestoreData.recurringPayments) {
        if (cancelled || !payment.id || !payment.isActive) continue;
        const lifecycle = findAuthenticatedRecurringReminderLifecycle({
          sourceNotifications: firestoreData.notifications,
          paymentId: payment.id,
          writerPrefix,
        });
        const cursor = cursorStore.read(payment.id);
        if (!lifecycle || !cursor) continue;

        try {
          const evaluation = evaluateRecurringReminderCursor({
            payment,
            now,
            timeZone,
            cursor,
            isPaid: (targetCycle) => firestoreData.transactions.some((transaction) =>
              recurringTransactionSatisfiesCycleKey(payment, transaction, targetCycle)),
          });
          if (evaluation.resolvedCycleKey && lifecycle.lifecycleStatus === 'active' && lifecycle.id) {
            await updateNotification(lifecycle.id, {
              lifecycleStatus: 'resolved',
              isRead: true,
              readRevision: lifecycle.revision,
              resolvedRevision: lifecycle.revision,
              resolvedAt: now,
              updatedAt: now,
            });
          }

          const advancesResolvedCycle = evaluation.activeStageWindow
            && evaluation.nextCursor.cycleKey !== cursor.cycleKey;
          const reactivatesCurrentCycle = evaluation.activeStageWindow
            && lifecycle.lifecycleStatus === 'resolved'
            && !evaluation.resolvedCycleKey;
          if (advancesResolvedCycle || reactivatesCurrentCycle) {
            await notificationManager.createNotification(buildRecurringReminderCandidate({
              payment,
              cursor: evaluation.nextCursor,
              writerPrefix,
            }));
          }
        } catch (error) {
          logger.error('Recurring notification recompute failed', error);
        }
      }
    };

    void recompute();
    return () => { cancelled = true; };
  }, [
    userId,
    firestoreData.loading,
    firestoreData.notifications,
    firestoreData.recurringPayments,
    firestoreData.transactions,
    cursorStore,
    timeZone,
    writerPrefix,
    notificationManager,
    updateNotification,
  ]);

  // Get unread count
  const unreadCount = useMemo(() => {
    return notifications.filter((notification) => !notification.isRead).length;
  }, [notifications]);

  // Mark as read
  const markAsRead = useCallback(
    async (id: string) => {
      await notificationManager.markAsRead(id);
    },
    [notificationManager]
  );

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    await notificationManager.markAllAsRead();
  }, [notificationManager]);

  // Delete notification
  const deleteNotif = useCallback(
    async (id: string) => {
      await notificationManager.deleteNotification(id);
    },
    [notificationManager]
  );

  // Clear all
  const clearAll = useCallback(async () => {
    await notificationManager.clearAll();
  }, [notificationManager]);

  // Get filtered notifications
  const getFilteredNotifications = useCallback(
    (filter?: NotificationFilter): Notification[] => {
      return notificationManager.getNotifications(filter);
    },
    [notificationManager]
  );

  // Create notification (exposed for manual creation if needed)
  const createNotification = useCallback(
    async (notification: Omit<Notification, 'id' | 'createdAt'>) => {
      await notificationManager.createNotification(notification);
    },
    [notificationManager]
  );

  return {
    // Data
    notifications,
    unreadCount,
    loading: storeLoading || preferencesLoading,
    preferences,

    // Operations
    markAsRead,
    markAllAsRead,
    deleteNotification: deleteNotif,
    clearAll,
    updatePreferences,
    createNotification,

    // Filters
    getFilteredNotifications,

    // Manager instance (for monitoring hook)
    notificationManager,
  };
}
