/**
 * Main hook for consuming notification functionality
 * Provides unified API for components
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useNotificationStore } from './useNotificationStore';
import { useNotificationPreferences } from './useNotificationPreferences';
import { NotificationManager } from '../services/NotificationManager';
import type { Notification, NotificationFilter, NotificationPreferences } from '../types/finance';

export function useNotifications(userId: string | null) {
  // Get store and preferences
  const {
    notifications,
    loading: storeLoading,
    addNotification,
    updateNotification,
    deleteNotification,
    clearAll: storeClearAll,
    markAllAsRead: storeMarkAllAsRead,
  } = useNotificationStore(userId);

  const {
    preferences,
    loading: preferencesLoading,
    updatePreferences,
  } = useNotificationPreferences(userId);

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

  // Get unread count
  const unreadCount = useMemo(() => {
    return notificationManager.getUnreadCount();
  }, [notificationManager, notifications]);

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
    [notificationManager, notifications]
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
