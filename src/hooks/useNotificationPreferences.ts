/**
 * Hook para gestión de preferencias de notificaciones
 * Soporta Firebase (usuario autenticado) y localStorage (modo invitado)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebaseDb';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import type { NotificationPreferences } from '../types/finance';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../types/finance';

export type PartialNotificationPreferences = Omit<Partial<NotificationPreferences>,
    'enabled' | 'thresholds' | 'quietHours' | 'browserNotifications' | 'dailyExpenseReminder'
> & {
    enabled?: Partial<NotificationPreferences['enabled']>;
    thresholds?: Partial<NotificationPreferences['thresholds']>;
    quietHours?: Partial<NotificationPreferences['quietHours']>;
    browserNotifications?: Partial<NotificationPreferences['browserNotifications']>;
    dailyExpenseReminder?: Partial<NotificationPreferences['dailyExpenseReminder']>;
};

/**
 * Mergea las prefs cargadas (Firestore/localStorage/externas) con los defaults.
 * Un doc guardado antes de que existiera un campo (quietHours, enabled.debt, …)
 * deja ese objeto/clave undefined; sin este merge, NotificationManager leería
 * quietHours.enabled / enabled[tipo] sobre undefined y lanzaría TypeError al
 * crear CUALQUIER notificación. Garantiza que los objetos anidados existan.
 */
export function withDefaults(p?: PartialNotificationPreferences | null): NotificationPreferences {
    return {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...p,
        enabled: { ...DEFAULT_NOTIFICATION_PREFERENCES.enabled, ...p?.enabled },
        thresholds: { ...DEFAULT_NOTIFICATION_PREFERENCES.thresholds, ...p?.thresholds },
        quietHours: { ...DEFAULT_NOTIFICATION_PREFERENCES.quietHours, ...p?.quietHours },
        browserNotifications: { ...DEFAULT_NOTIFICATION_PREFERENCES.browserNotifications, ...p?.browserNotifications },
        dailyExpenseReminder: { ...DEFAULT_NOTIFICATION_PREFERENCES.dailyExpenseReminder, ...p?.dailyExpenseReminder },
    };
}

export function validateNotificationThresholds(thresholds: NotificationPreferences['thresholds']): void {
    const { budgetWarning, budgetCritical, budgetExceeded, unusualSpending, lowBalance } = thresholds;

    if (budgetWarning >= budgetCritical) {
        throw new Error('Budget warning threshold must be lower than critical');
    }
    if (budgetCritical > budgetExceeded) {
        throw new Error('Budget critical threshold must be at most budget exceeded');
    }
    if (budgetExceeded < 100) {
        throw new Error('Budget exceeded threshold must be at least 100');
    }
    if (budgetWarning < 0 || budgetWarning > 100) {
        throw new Error('Budget warning threshold must be between 0 and 100');
    }
    if (budgetCritical < 0 || budgetCritical > 100) {
        throw new Error('Budget critical threshold must be between 0 and 100');
    }
    if (budgetExceeded > 200) {
        throw new Error('Budget exceeded threshold must be between 0 and 200');
    }
    if (unusualSpending < 100 || unusualSpending > 1000) {
        throw new Error('Unusual spending threshold must be between 100 and 1000');
    }
    if (lowBalance < 0) {
        throw new Error('Low balance threshold must be positive');
    }
}

export function useNotificationPreferences(userId: string | null, externalPreferences?: NotificationPreferences) {
    // Firestore state
    const [firestorePreferences, setFirestorePreferences] = useState<NotificationPreferences>(
        DEFAULT_NOTIFICATION_PREFERENCES
    );
    const [loading, setLoading] = useState(true);

    // LocalStorage for guest mode
    const [localPreferences, setLocalPreferences] = useLocalStorage<NotificationPreferences>(
        'notificationPreferences',
        DEFAULT_NOTIFICATION_PREFERENCES
    );

    // Guard to only auto-init defaults once per userId
    const initDoneRef = useRef<string | null>(null);

    // Firestore subscription — skip if data provided externally
    useEffect(() => {
        if (externalPreferences !== undefined) {
            setLoading(false);
            return;
        }
        if (!userId) {
            setFirestorePreferences(DEFAULT_NOTIFICATION_PREFERENCES);
            setLoading(false);
            return;
        }

        setLoading(true);
        const preferencesRef = doc(db, `users/${userId}/notificationPreferences/settings`);

        const unsubscribe = onSnapshot(
            preferencesRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    setFirestorePreferences(snapshot.data() as NotificationPreferences);
                } else if (initDoneRef.current !== userId) {
                    // Initialize with defaults only once per user session
                    initDoneRef.current = userId;
                    setDoc(preferencesRef, DEFAULT_NOTIFICATION_PREFERENCES).catch((error) => {
                        logger.error('Failed to initialize notification preferences', error);
                    });
                    setFirestorePreferences(DEFAULT_NOTIFICATION_PREFERENCES);
                }
                setLoading(false);
            },
            (err) => {
                logger.error('Error en preferencias de notificaciones', err);
                setFirestorePreferences(DEFAULT_NOTIFICATION_PREFERENCES);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [externalPreferences, userId]);

    // Usar Firebase si hay usuario, localStorage si no. Siempre mergeado con
    // defaults para que los objetos anidados existan aunque el doc sea legacy.
    const preferences = useMemo(
        () => withDefaults(externalPreferences ?? (userId ? firestorePreferences : localPreferences)),
        [externalPreferences, userId, firestorePreferences, localPreferences]
    );

    // Update preferences
    const updatePreferences = useCallback(
        async (updates: PartialNotificationPreferences) => {
            // Validate thresholds
            if (updates.thresholds) {
                validateNotificationThresholds({ ...preferences.thresholds, ...updates.thresholds });
            }

            // Validate quiet hours
            if (updates.quietHours) {
                const { startHour, endHour } = updates.quietHours;
                if (startHour !== undefined && (startHour < 0 || startHour > 23)) {
                    throw new Error('Start hour must be between 0 and 23');
                }
                if (endHour !== undefined && (endHour < 0 || endHour > 23)) {
                    throw new Error('End hour must be between 0 and 23');
                }
            }

            if (updates.dailyExpenseReminder) {
                const { hour, minute } = updates.dailyExpenseReminder;
                if (hour !== undefined && (hour < 0 || hour > 23)) {
                    throw new Error('Reminder hour must be between 0 and 23');
                }
                if (minute !== undefined && (minute < 0 || minute > 59)) {
                    throw new Error('Reminder minute must be between 0 and 59');
                }
            }

            const newPreferences = {
                ...preferences,
                ...updates,
                enabled: { ...preferences.enabled, ...updates.enabled },
                thresholds: { ...preferences.thresholds, ...updates.thresholds },
                quietHours: { ...preferences.quietHours, ...updates.quietHours },
                browserNotifications: { ...preferences.browserNotifications, ...updates.browserNotifications },
                dailyExpenseReminder: { ...preferences.dailyExpenseReminder, ...updates.dailyExpenseReminder },
            };

            if (userId) {
                try {
                    await setDoc(doc(db, `users/${userId}/notificationPreferences/settings`), newPreferences);
                } catch (error) {
                    logger.error('Failed to update notification preferences', error);
                    throw error;
                }
            } else {
                setLocalPreferences(newPreferences);
            }
        },
        [userId, preferences, setLocalPreferences]
    );

    return {
        preferences,
        loading,
        updatePreferences,
    };
}
