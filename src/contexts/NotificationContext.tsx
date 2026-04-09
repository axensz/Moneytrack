'use client';

/**
 * NotificationContext — Single source of truth for notification state.
 *
 * Fix: Accepts userId as prop instead of calling useAuth() internally,
 * avoiding a duplicate onAuthStateChanged listener.
 */

import React, { createContext, useContext } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import type { Notification, NotificationFilter, NotificationPreferences } from '../types/finance';
import type { NotificationManager } from '../services/NotificationManager';

interface NotificationContextValue {
    notifications: Notification[];
    unreadCount: number;
    loading: boolean;
    preferences: NotificationPreferences;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    clearAll: () => Promise<void>;
    updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<void>;
    createNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => Promise<void>;
    getFilteredNotifications: (filter?: NotificationFilter) => Notification[];
    notificationManager: NotificationManager;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

interface NotificationProviderProps {
    userId: string | null;
    children: React.ReactNode;
}

export function NotificationProvider({ userId, children }: NotificationProviderProps) {
    const value = useNotifications(userId);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotificationContext(): NotificationContextValue {
    const ctx = useContext(NotificationContext);
    if (!ctx) {
        throw new Error('useNotificationContext must be used within NotificationProvider');
    }
    return ctx;
}
