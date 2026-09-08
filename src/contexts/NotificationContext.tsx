'use client';

/**
 * NotificationContext — Single source of truth for notification state.
 *
 * Fix: Accepts userId as prop instead of calling useAuth() internally,
 * avoiding a duplicate onAuthStateChanged listener.
 */

import React, { createContext, useContext, useEffect } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { setCurrentDeviceBrowserGate } from '../services/NotificationManager';
import {
    useCurrentDeviceNotifications,
    type CurrentDeviceNotifications,
} from '../hooks/useCurrentDeviceNotifications';
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
    /** Estado y acciones del dispositivo actual (una sola instancia por provider). */
    currentDevice: CurrentDeviceNotifications;
    /** Atajo de conveniencia para el cierre de sesión (delegado en currentDevice). */
    prepareForSignOut: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

interface NotificationProviderProps {
    userId: string | null;
    children: React.ReactNode;
}

export function NotificationProvider({ userId, children }: NotificationProviderProps) {
    const notifications = useNotifications(userId);
    // Exactly ONE current-device instance lives here, at the provider.
    const currentDevice = useCurrentDeviceNotifications(userId);

    // Conecta la compuerta OS del dispositivo actual al NotificationManager.
    // El manager la consulta de forma perezosa desde un registro a nivel de
    // módulo (en NotificationManager), por lo que sobrevive a las
    // reconstrucciones de deps que hace useNotifications al cambiar preferencias
    // o notificaciones. Se hace en el provider, donde ambos hooks conviven.
    const gate = currentDevice.canShowBrowserNotification;
    useEffect(() => {
        setCurrentDeviceBrowserGate(gate);
        return () => setCurrentDeviceBrowserGate(null);
    }, [gate]);

    // Cancela las presentaciones OS diferidas al cambiar de cuenta o desmontar
    // (logout desmonta el provider). Así un evento diferido de la sesión previa
    // no puede presentarse tras el cambio/cierre. El re-chequeo del gate al
    // disparar ya lo impide, pero cancelar proactivamente cumple el contrato.
    const manager = notifications.notificationManager;
    useEffect(() => {
        return () => manager.cancelDeferredPresentations();
    }, [manager, userId]);

    const value: NotificationContextValue = {
        ...notifications,
        currentDevice,
        prepareForSignOut: currentDevice.prepareForSignOut,
    };

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
