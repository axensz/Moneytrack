/**
 * Hook para gestión de preferencias de notificaciones
 * Soporta Firebase (usuario autenticado) y localStorage (modo invitado)
 */

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import type { NotificationPreferences } from '../types/finance';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../types/finance';

export function useNotificationPreferences(userId: string | null) {
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

    // Firestore subscription
    useEffect(() => {
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
                } else {
                    // Initialize with defaults if doesn't exist
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
    }, [userId]);

    // Usar Firebase si hay usuario, localStorage si no
    const preferences = userId ? firestorePreferences : localPreferences;

    // Update preferences
    const updatePreferences = useCallback(
        async (updates: Partial<NotificationPreferences>) => {
            // Validate thresholds
            if (updates.thresholds) {
                const { budgetWarning, budgetCritical, budgetExceeded, unusualSpending, lowBalance } = updates.thresholds;

                if (budgetWarning !== undefined && (budgetWarning < 0 || budgetWarning > 100)) {
                    throw new Error('Budget warning threshold must be between 0 and 100');
                }
                if (budgetCritical !== undefined && (budgetCritical < 0 || budgetCritical > 100)) {
                    throw new Error('Budget critical threshold must be between 0 and 100');
                }
                if (budgetExceeded !== undefined && (budgetExceeded < 0 || budgetExceeded > 200)) {
                    throw new Error('Budget exceeded threshold must be between 0 and 200');
                }
                if (unusualSpending !== undefined && (unusualSpending < 100 || unusualSpending > 1000)) {
                    throw new Error('Unusual spending threshold must be between 100 and 1000');
                }
                if (lowBalance !== undefined && lowBalance < 0) {
                    throw new Error('Low balance threshold must be positive');
                }
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

            const newPreferences = {
                ...preferences,
                ...updates,
                enabled: { ...preferences.enabled, ...updates.enabled },
                thresholds: { ...preferences.thresholds, ...updates.thresholds },
                quietHours: { ...preferences.quietHours, ...updates.quietHours },
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
