/**
 * Hook para almacenamiento de notificaciones
 * Soporta Firebase (usuario autenticado) y localStorage (modo invitado)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, limit as firestoreLimit, updateDoc, deleteDoc, doc, writeBatch, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import type { Notification } from '../types/finance';

const MAX_NOTIFICATIONS = 100;
const PRUNE_DAYS = 30;

export function useNotificationStore(userId: string | null, externalNotifications?: Notification[]) {
    // Firestore state (only used if no external data)
    const [firestoreNotifications, setFirestoreNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    // Ref to avoid recreating addNotification on every snapshot update
    const firestoreNotificationsRef = useRef<Notification[]>([]);
    firestoreNotificationsRef.current = externalNotifications ?? firestoreNotifications;

    // LocalStorage for guest mode
    const [localNotifications, setLocalNotifications] = useLocalStorage<Notification[]>('notifications', []);

    // Ref for localStorage too — same reason
    const localNotificationsRef = useRef<Notification[]>([]);
    localNotificationsRef.current = localNotifications;

    // Firestore subscription — skip if data provided externally
    useEffect(() => {
        if (externalNotifications !== undefined) {
            setLoading(false);
            return;
        }
        if (!userId) {
            setFirestoreNotifications([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const notificationsRef = collection(db, `users/${userId}/notifications`);
        const notificationsQuery = query(notificationsRef, orderBy('createdAt', 'desc'), firestoreLimit(MAX_NOTIFICATIONS));

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
    const notifications = externalNotifications ?? (userId ? firestoreNotifications : localNotifications);

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

    // Add notification con docId determinístico (verdaderamente idempotente)
    const addNotification = useCallback(
        async (notification: Omit<Notification, 'id' | 'createdAt'>) => {
            if (userId) {
                try {
                    const docId = generateDedupeDocId(notification);

                    // Verificar en memoria (el onSnapshot mantiene la lista actualizada)
                    // El debounce de 60s en NotificationManager ya filtra duplicados rápidos,
                    // y el docId determinístico previene duplicados diarios en Firestore.
                    const existsInMemory = firestoreNotificationsRef.current.some(n => n.id === docId);
                    if (existsInMemory) {
                        return;
                    }

                    await setDoc(doc(db, `users/${userId}/notifications`, docId), {
                        ...notification,
                        createdAt: Timestamp.now(),
                    });
                } catch (error) {
                    logger.error('Failed to add notification', error);
                    throw error;
                }
            } else {
                const docId = generateDedupeDocId(notification);

                if (localNotificationsRef.current.some(n => n.id === docId)) {
                    return;
                }

                const newNotification: Notification = {
                    ...notification,
                    id: docId,
                    createdAt: new Date(),
                };

                let updated = [newNotification, ...localNotificationsRef.current];
                if (updated.length > MAX_NOTIFICATIONS) {
                    updated = updated.slice(0, MAX_NOTIFICATIONS);
                }

                setLocalNotifications(updated);
            }
        },
        [userId, setLocalNotifications, generateDedupeDocId]
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

    // Helper: commit operations in batches of 499 (Firestore limit is 500)
    const commitInBatches = useCallback(async (
        operations: Array<{ type: 'delete' | 'update'; id: string; data?: Record<string, unknown> }>
    ) => {
        const BATCH_LIMIT = 499;
        for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
            const chunk = operations.slice(i, i + BATCH_LIMIT);
            const batch = writeBatch(db);
            chunk.forEach((op) => {
                const ref = doc(db, `users/${userId}/notifications`, op.id);
                if (op.type === 'delete') {
                    batch.delete(ref);
                } else if (op.data) {
                    batch.update(ref, op.data);
                }
            });
            await batch.commit();
        }
    }, [userId]);

    // Clear all notifications con optimistic update (fix #8: chunked batches)
    const clearAll = useCallback(async () => {
        if (userId) {
            const currentNotifications = firestoreNotificationsRef.current;
            const previousNotifications = [...currentNotifications];
            setFirestoreNotifications([]);

            try {
                const ops = previousNotifications
                    .filter((n) => n.id)
                    .map((n) => ({ type: 'delete' as const, id: n.id! }));
                await commitInBatches(ops);
                logger.info('All notifications cleared successfully');
            } catch (error) {
                setFirestoreNotifications(previousNotifications);
                logger.error('Failed to clear all notifications', error);
                throw error;
            }
        } else {
            setLocalNotifications([]);
        }
    }, [userId, setLocalNotifications, commitInBatches]);

    // Mark all as read con optimistic update (fix #8: chunked batches)
    const markAllAsRead = useCallback(async () => {
        if (userId) {
            const currentNotifications = firestoreNotificationsRef.current;
            const unreadNotifications = currentNotifications.filter((n) => !n.isRead);
            if (unreadNotifications.length === 0) return;

            const previousNotifications = [...currentNotifications];
            setFirestoreNotifications(prev => prev.map(n => ({ ...n, isRead: true })));

            try {
                const ops = unreadNotifications
                    .filter((n) => n.id)
                    .map((n) => ({ type: 'update' as const, id: n.id!, data: { isRead: true } }));
                await commitInBatches(ops);
                logger.info(`Marked ${unreadNotifications.length} notifications as read`);
            } catch (error) {
                setFirestoreNotifications(previousNotifications);
                logger.error('Failed to mark all as read', error);
                throw error;
            }
        } else {
            setLocalNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        }
    }, [userId, setLocalNotifications, commitInBatches]);

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
