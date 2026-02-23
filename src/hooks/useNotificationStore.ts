/**
 * Hook para almacenamiento de notificaciones
 * Soporta Firebase (usuario autenticado) y localStorage (modo invitado)
 */

import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, writeBatch, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import type { Notification } from '../types/finance';

const MAX_NOTIFICATIONS = 100;
const PRUNE_DAYS = 30;

export function useNotificationStore(userId: string | null) {
    // Firestore state
    const [firestoreNotifications, setFirestoreNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    // LocalStorage for guest mode
    const [localNotifications, setLocalNotifications] = useLocalStorage<Notification[]>('notifications', []);

    // Firestore subscription
    useEffect(() => {
        if (!userId) {
            setFirestoreNotifications([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const notificationsRef = collection(db, `users/${userId}/notifications`);
        const notificationsQuery = query(notificationsRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(
            notificationsQuery,
            (snapshot) => {
                const data = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate() || new Date(),
                })) as Notification[];
                setFirestoreNotifications(data);
                setLoading(false);
            },
            (err) => {
                logger.error('Error en notificaciones', err);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [userId]);

    // Usar Firebase si hay usuario, localStorage si no
    const notifications = userId ? firestoreNotifications : localNotifications;

    // Prune old notifications on initialization
    useEffect(() => {
        const pruneOldNotifications = async () => {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - PRUNE_DAYS);

            if (userId) {
                // Firestore: batch delete old notifications
                const oldNotifications = notifications.filter(
                    (n) => n.createdAt && n.createdAt < cutoffDate
                );

                if (oldNotifications.length > 0) {
                    try {
                        const batch = writeBatch(db);
                        oldNotifications.forEach((n) => {
                            if (n.id) {
                                batch.delete(doc(db, `users/${userId}/notifications`, n.id));
                            }
                        });
                        await batch.commit();
                        logger.info(`Pruned ${oldNotifications.length} old notifications`);
                    } catch (error) {
                        logger.error('Failed to prune old notifications', error);
                    }
                }
            } else {
                // localStorage: filter out old notifications
                const freshNotifications = localNotifications.filter(
                    (n) => n.createdAt && new Date(n.createdAt) >= cutoffDate
                );
                if (freshNotifications.length !== localNotifications.length) {
                    setLocalNotifications(freshNotifications);
                    logger.info(`Pruned ${localNotifications.length - freshNotifications.length} old notifications`);
                }
            }
        };

        if (!loading) {
            pruneOldNotifications();
        }
    }, [userId, loading]); // Only run after initial load

    // ✅ FIX #2: Generar docId determinístico para deduplicación
    const generateDedupeDocId = useCallback((notification: Omit<Notification, 'id' | 'createdAt'>): string => {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const parts: string[] = [];

        // Tipo de notificación
        parts.push(notification.type.toUpperCase());

        // Identificador específico según metadata
        if (notification.metadata) {
            const { accountId, budgetId, categoryName, transactionId, recurringPaymentId, debtId } = notification.metadata;

            if (accountId) parts.push(accountId);
            if (budgetId) parts.push(budgetId);
            if (categoryName) parts.push(categoryName.replace(/\s+/g, '_'));
            if (transactionId) parts.push(transactionId);
            if (recurringPaymentId) parts.push(recurringPaymentId);
            if (debtId) parts.push(debtId);
        }

        // Fecha para deduplicación diaria
        parts.push(today);

        return parts.join('_');
    }, []);

    // ✅ FIX #2: Add notification con docId determinístico (idempotente)
    const addNotification = useCallback(
        async (notification: Omit<Notification, 'id' | 'createdAt'>) => {
            if (userId) {
                try {
                    // Generar docId determinístico
                    const docId = generateDedupeDocId(notification);

                    // Usar setDoc con merge para idempotencia
                    // Si el documento ya existe, no lo sobrescribe
                    await setDoc(
                        doc(db, `users/${userId}/notifications`, docId),
                        {
                            ...notification,
                            createdAt: Timestamp.now(),
                        },
                        { merge: false } // No merge: si existe, no hace nada
                    );

                    logger.info('Notification created with dedupeId', { docId, type: notification.type });
                } catch (error) {
                    // Si el error es porque el documento ya existe, no es un error real
                    if ((error as any).code === 'already-exists') {
                        logger.info('Notification already exists, skipping', { type: notification.type });
                        return;
                    }
                    logger.error('Failed to add notification', error);
                    throw error;
                }
            } else {
                // LocalStorage: usar dedupeId como id
                const docId = generateDedupeDocId(notification);

                // Verificar si ya existe
                const exists = localNotifications.some(n => n.id === docId);
                if (exists) {
                    logger.info('Notification already exists in localStorage, skipping', { type: notification.type });
                    return;
                }

                const newNotification: Notification = {
                    ...notification,
                    id: docId,
                    createdAt: new Date(),
                };

                // Enforce limit
                let updatedNotifications = [newNotification, ...localNotifications];
                if (updatedNotifications.length > MAX_NOTIFICATIONS) {
                    updatedNotifications = updatedNotifications.slice(0, MAX_NOTIFICATIONS);
                }

                setLocalNotifications(updatedNotifications);
            }
        },
        [userId, localNotifications, setLocalNotifications, generateDedupeDocId]
    );

    // Update notification
    const updateNotification = useCallback(
        async (id: string, updates: Partial<Notification>) => {
            if (userId) {
                try {
                    await updateDoc(doc(db, `users/${userId}/notifications`, id), updates);
                } catch (error) {
                    logger.error('Failed to update notification', error);
                    throw error;
                }
            } else {
                setLocalNotifications((prev) =>
                    prev.map((n) => (n.id === id ? { ...n, ...updates } : n))
                );
            }
        },
        [userId, setLocalNotifications]
    );

    // Delete notification
    const deleteNotification = useCallback(
        async (id: string) => {
            if (userId) {
                try {
                    await deleteDoc(doc(db, `users/${userId}/notifications`, id));
                } catch (error) {
                    logger.error('Failed to delete notification', error);
                    throw error;
                }
            } else {
                setLocalNotifications((prev) => prev.filter((n) => n.id !== id));
            }
        },
        [userId, setLocalNotifications]
    );

    // ✅ FIX #5: Clear all notifications con optimistic update
    const clearAll = useCallback(async () => {
        console.log('[NotificationStore] clearAll called, userId:', userId, 'notifications count:', notifications.length);

        if (userId) {
            // Guardar estado anterior para rollback
            const previousNotifications = [...firestoreNotifications];

            // Optimistic update: limpiar inmediatamente en UI
            setFirestoreNotifications([]);

            try {
                const batch = writeBatch(db);
                previousNotifications.forEach((n) => {
                    if (n.id) {
                        batch.delete(doc(db, `users/${userId}/notifications`, n.id));
                    }
                });

                console.log('[NotificationStore] Committing batch delete for', previousNotifications.length, 'notifications');
                await batch.commit();
                console.log('[NotificationStore] Batch delete committed successfully');
                logger.info('All notifications cleared successfully');
            } catch (error) {
                // Rollback en caso de error
                console.error('[NotificationStore] Error clearing notifications:', error);
                setFirestoreNotifications(previousNotifications);
                logger.error('Failed to clear all notifications', error);
                throw error;
            }
        } else {
            console.log('[NotificationStore] Clearing local notifications');
            setLocalNotifications([]);
            logger.info('All local notifications cleared');
        }
    }, [userId, firestoreNotifications, setLocalNotifications]);

    // ✅ FIX #5: Mark all as read con optimistic update
    const markAllAsRead = useCallback(async () => {
        console.log('[NotificationStore] markAllAsRead called, userId:', userId);

        if (userId) {
            const unreadNotifications = firestoreNotifications.filter((n) => !n.isRead);
            console.log('[NotificationStore] Found', unreadNotifications.length, 'unread notifications');

            if (unreadNotifications.length === 0) {
                console.log('[NotificationStore] No unread notifications to mark');
                logger.info('No unread notifications to mark');
                return;
            }

            // Guardar estado anterior para rollback
            const previousNotifications = [...firestoreNotifications];

            // Optimistic update: marcar como leídas inmediatamente en UI
            setFirestoreNotifications(prev =>
                prev.map(n => ({ ...n, isRead: true }))
            );

            try {
                const batch = writeBatch(db);
                unreadNotifications.forEach((n) => {
                    if (n.id) {
                        batch.update(doc(db, `users/${userId}/notifications`, n.id), { isRead: true });
                    }
                });

                console.log('[NotificationStore] Committing batch update for', unreadNotifications.length, 'notifications');
                await batch.commit();
                console.log('[NotificationStore] Batch update committed successfully');
                logger.info(`Marked ${unreadNotifications.length} notifications as read`);
            } catch (error) {
                // Rollback en caso de error
                console.error('[NotificationStore] Error marking as read:', error);
                setFirestoreNotifications(previousNotifications);
                logger.error('Failed to mark all as read', error);
                throw error;
            }
        } else {
            console.log('[NotificationStore] Marking all local notifications as read');
            setLocalNotifications((prev) =>
                prev.map((n) => ({ ...n, isRead: true }))
            );
            logger.info('All local notifications marked as read');
        }
    }, [userId, firestoreNotifications, setLocalNotifications]);

    return {
        notifications,
        loading,
        addNotification,
        updateNotification,
        deleteNotification,
        clearAll,
        markAllAsRead,
    };
}
