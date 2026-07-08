/**
 * Hook para almacenamiento de notificaciones
 * Soporta Firebase (usuario autenticado) y localStorage (modo invitado)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, limit as firestoreLimit, updateDoc, deleteDoc, doc, writeBatch, setDoc } from 'firebase/firestore';
import { ensureDate, localDateKey } from '../utils/dateUtils';
import { db } from '../lib/firebaseDb';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import type { Notification } from '../types/finance';

const MAX_NOTIFICATIONS = 100;
const PRUNE_DAYS = 30;

const notificationIds = (notifications: Notification[]): string[] =>
    notifications.map((n) => n.id).filter((id): id is string => Boolean(id));

const addOptimisticIds = (current: Set<string>, ids: string[]): Set<string> => {
    if (ids.length === 0) return current;

    const next = new Set(current);
    ids.forEach((id) => next.add(id));
    return next.size === current.size ? current : next;
};

const removeOptimisticIds = (current: Set<string>, ids: string[]): Set<string> => {
    if (ids.length === 0 || current.size === 0) return current;

    const next = new Set(current);
    let changed = false;
    ids.forEach((id) => {
        if (next.delete(id)) changed = true;
    });
    return changed ? next : current;
};

export function useNotificationStore(userId: string | null, externalNotifications?: Notification[]) {
    // Firestore state (only used if no external data)
    const [firestoreNotifications, setFirestoreNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<Set<string>>(() => new Set());
    const [optimisticReadIds, setOptimisticReadIds] = useState<Set<string>>(() => new Set());

    // Ref to avoid recreating addNotification on every snapshot update
    const firestoreNotificationsRef = useRef<Notification[]>([]);
    const visibleNotificationsRef = useRef<Notification[]>([]);

    // LocalStorage for guest mode
    const [localNotifications, setLocalNotifications] = useLocalStorage<Notification[]>('notifications', []);

    // Ref for localStorage too — same reason
    const localNotificationsRef = useRef<Notification[]>([]);
    localNotificationsRef.current = localNotifications;
    const hasExternalNotifications = externalNotifications !== undefined;

    // Firestore subscription — skip if data provided externally
    useEffect(() => {
        if (hasExternalNotifications) {
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
    }, [userId, hasExternalNotifications]);

    const sourceNotifications = externalNotifications ?? (userId ? firestoreNotifications : localNotifications);

    // Usar Firebase si hay usuario, localStorage si no
    const notifications = useMemo(
        () => sourceNotifications
            .filter((n) => !n.id || !optimisticDeletedIds.has(n.id))
            .map((n) => (
                n.id && optimisticReadIds.has(n.id) && !n.isRead
                    ? { ...n, isRead: true }
                    : n
            )),
        [sourceNotifications, optimisticDeletedIds, optimisticReadIds]
    );

    firestoreNotificationsRef.current = sourceNotifications;
    visibleNotificationsRef.current = notifications;

    useEffect(() => {
        if (!userId) {
            setOptimisticDeletedIds(new Set());
            setOptimisticReadIds(new Set());
            return;
        }

        const sourceIds = new Set(notificationIds(sourceNotifications));
        const confirmedReadIds = new Set(
            sourceNotifications
                .filter((n) => n.id && n.isRead)
                .map((n) => n.id!)
        );

        setOptimisticDeletedIds((current) =>
            removeOptimisticIds(current, [...current].filter((id) => !sourceIds.has(id)))
        );
        setOptimisticReadIds((current) =>
            removeOptimisticIds(
                current,
                [...current].filter((id) => !sourceIds.has(id) || confirmedReadIds.has(id))
            )
        );
    }, [userId, sourceNotifications]);

    // Prune old notifications on initialization
    useEffect(() => {
        const pruneOldNotifications = async () => {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - PRUNE_DAYS);

            if (userId) {
                // Firestore: batch delete old notifications
                const oldNotifications = visibleNotificationsRef.current.filter(
                    (n) => n.createdAt && ensureDate(n.createdAt) < cutoffDate
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
                const currentLocalNotifications = localNotificationsRef.current;
                const freshNotifications = currentLocalNotifications.filter(
                    (n) => n.createdAt && ensureDate(n.createdAt) >= cutoffDate
                );
                if (freshNotifications.length !== currentLocalNotifications.length) {
                    setLocalNotifications(freshNotifications);
                    logger.info(`Pruned ${currentLocalNotifications.length - freshNotifications.length} old notifications`);
                }
            }
        };

        if (!loading) {
            pruneOldNotifications();
        }
    }, [userId, loading, setLocalNotifications]); // Only run after initial load

    // ✅ FIX #2: Generar docId determinístico para deduplicación
    const generateDedupeDocId = useCallback((notification: Omit<Notification, 'id' | 'createdAt'>): string => {
        const today = localDateKey(); // fecha LOCAL (no UTC): alinea el corte diario con el día del usuario
        const parts: string[] = [];

        // Tipo de notificación
        parts.push(notification.type.toUpperCase());

        // Identificador específico según metadata
        if (notification.metadata) {
            const { accountId, budgetId, categoryName, transactionId, recurringPaymentId, debtId, reminderKey } = notification.metadata;

            if (accountId) parts.push(accountId);
            if (budgetId) parts.push(budgetId);
            if (categoryName) parts.push(categoryName.replace(/\s+/g, '_'));
            if (transactionId) parts.push(transactionId);
            if (recurringPaymentId) parts.push(recurringPaymentId);
            if (debtId) parts.push(debtId);
            if (reminderKey) parts.push(reminderKey);
        }

        // Fecha para deduplicación diaria
        parts.push(today);

        return parts.join('_');
    }, []);

    // Add notification con docId determinístico (verdaderamente idempotente)
    const addNotification = useCallback(
        async (notification: Omit<Notification, 'id' | 'createdAt'>): Promise<boolean> => {
            if (userId) {
                try {
                    const docId = generateDedupeDocId(notification);

                    // Verificar en memoria (el onSnapshot mantiene la lista actualizada)
                    // El debounce de 60s en NotificationManager ya filtra duplicados rápidos,
                    // y el docId determinístico previene duplicados diarios en Firestore.
                    const existsInMemory = firestoreNotificationsRef.current.some(n => n.id === docId);
                    if (existsInMemory) {
                        return false; // ya existe hoy → no se creó nada (no re-mostrar toast al recargar)
                    }

                    await setDoc(doc(db, `users/${userId}/notifications`, docId), {
                        ...notification,
                        createdAt: new Date(),
                    });
                    return true;
                } catch (error) {
                    logger.error('Failed to add notification', error);
                    throw error;
                }
            } else {
                const docId = generateDedupeDocId(notification);

                if (localNotificationsRef.current.some(n => n.id === docId)) {
                    return false;
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
                return true;
            }
        },
        [userId, setLocalNotifications, generateDedupeDocId]
    );

    // Update notification
    const updateNotification = useCallback(
        async (id: string, updates: Partial<Notification>) => {
            if (userId) {
                const previousNotifications = visibleNotificationsRef.current;
                const ids = [id];

                if (hasExternalNotifications) {
                    if (updates.isRead === true) {
                        setOptimisticReadIds((current) => addOptimisticIds(current, ids));
                    } else if (updates.isRead === false) {
                        setOptimisticReadIds((current) => removeOptimisticIds(current, ids));
                    }
                } else {
                    setFirestoreNotifications((prev) =>
                        prev.map((n) => (n.id === id ? { ...n, ...updates } : n))
                    );
                }

                try {
                    await updateDoc(doc(db, `users/${userId}/notifications`, id), updates);
                } catch (error) {
                    if (hasExternalNotifications) {
                        if (updates.isRead === true) {
                            setOptimisticReadIds((current) => removeOptimisticIds(current, ids));
                        }
                    } else {
                        setFirestoreNotifications(previousNotifications);
                    }
                    logger.error('Failed to update notification', error);
                    throw error;
                }
            } else {
                setLocalNotifications((prev) =>
                    prev.map((n) => (n.id === id ? { ...n, ...updates } : n))
                );
            }
        },
        [userId, hasExternalNotifications, setLocalNotifications]
    );

    // Delete notification
    const deleteNotification = useCallback(
        async (id: string) => {
            if (userId) {
                const previousNotifications = visibleNotificationsRef.current;
                const ids = [id];

                if (hasExternalNotifications) {
                    setOptimisticDeletedIds((current) => addOptimisticIds(current, ids));
                } else {
                    setFirestoreNotifications((prev) => prev.filter((n) => n.id !== id));
                }

                try {
                    await deleteDoc(doc(db, `users/${userId}/notifications`, id));
                } catch (error) {
                    if (hasExternalNotifications) {
                        setOptimisticDeletedIds((current) => removeOptimisticIds(current, ids));
                    } else {
                        setFirestoreNotifications(previousNotifications);
                    }
                    logger.error('Failed to delete notification', error);
                    throw error;
                }
            } else {
                setLocalNotifications((prev) => prev.filter((n) => n.id !== id));
            }
        },
        [userId, hasExternalNotifications, setLocalNotifications]
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
            const currentNotifications = visibleNotificationsRef.current;
            const previousNotifications = [...currentNotifications];
            const ids = notificationIds(previousNotifications);

            if (hasExternalNotifications) {
                setOptimisticDeletedIds((current) => addOptimisticIds(current, ids));
            } else {
                setFirestoreNotifications([]);
            }

            try {
                const ops = ids.map((id) => ({ type: 'delete' as const, id }));
                await commitInBatches(ops);
                logger.info('All notifications cleared successfully');
            } catch (error) {
                if (hasExternalNotifications) {
                    setOptimisticDeletedIds((current) => removeOptimisticIds(current, ids));
                } else {
                    setFirestoreNotifications(previousNotifications);
                }
                logger.error('Failed to clear all notifications', error);
                throw error;
            }
        } else {
            setLocalNotifications([]);
        }
    }, [userId, hasExternalNotifications, setLocalNotifications, commitInBatches]);

    // Mark all as read con optimistic update (fix #8: chunked batches)
    const markAllAsRead = useCallback(async () => {
        if (userId) {
            const currentNotifications = visibleNotificationsRef.current;
            const unreadNotifications = currentNotifications.filter((n) => !n.isRead);
            if (unreadNotifications.length === 0) return;

            const previousNotifications = [...currentNotifications];
            const ids = notificationIds(unreadNotifications);

            if (hasExternalNotifications) {
                setOptimisticReadIds((current) => addOptimisticIds(current, ids));
            } else {
                setFirestoreNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            }

            try {
                const ops = ids.map((id) => ({ type: 'update' as const, id, data: { isRead: true } }));
                await commitInBatches(ops);
                logger.info(`Marked ${unreadNotifications.length} notifications as read`);
            } catch (error) {
                if (hasExternalNotifications) {
                    setOptimisticReadIds((current) => removeOptimisticIds(current, ids));
                } else {
                    setFirestoreNotifications(previousNotifications);
                }
                logger.error('Failed to mark all as read', error);
                throw error;
            }
        } else {
            setLocalNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        }
    }, [userId, hasExternalNotifications, setLocalNotifications, commitInBatches]);

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
