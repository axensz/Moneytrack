/**
 * Hook para almacenamiento de notificaciones
 * Soporta Firebase (usuario autenticado) y localStorage (modo invitado)
 */

import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, writeBatch, Timestamp } from 'firebase/firestore';
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

    // Add notification
    const addNotification = useCallback(
        async (notification: Omit<Notification, 'id' | 'createdAt'>) => {
            if (userId) {
                try {
                    await addDoc(collection(db, `users/${userId}/notifications`), {
                        ...notification,
                        createdAt: Timestamp.now(),
                    });
                } catch (error) {
                    logger.error('Failed to add notification', error);
                    throw error;
                }
            } else {
                const newNotification: Notification = {
                    ...notification,
                    id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
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
        [userId, localNotifications, setLocalNotifications]
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

    // Clear all notifications
    const clearAll = useCallback(async () => {
        if (userId) {
            try {
                const batch = writeBatch(db);
                notifications.forEach((n) => {
                    if (n.id) {
                        batch.delete(doc(db, `users/${userId}/notifications`, n.id));
                    }
                });
                await batch.commit();
            } catch (error) {
                logger.error('Failed to clear all notifications', error);
                throw error;
            }
        } else {
            setLocalNotifications([]);
        }
    }, [userId, notifications, setLocalNotifications]);

    // Mark all as read
    const markAllAsRead = useCallback(async () => {
        if (userId) {
            try {
                const batch = writeBatch(db);
                notifications
                    .filter((n) => !n.isRead)
                    .forEach((n) => {
                        if (n.id) {
                            batch.update(doc(db, `users/${userId}/notifications`, n.id), { isRead: true });
                        }
                    });
                await batch.commit();
            } catch (error) {
                logger.error('Failed to mark all as read', error);
                throw error;
            }
        } else {
            setLocalNotifications((prev) =>
                prev.map((n) => ({ ...n, isRead: true }))
            );
        }
    }, [userId, notifications, setLocalNotifications]);

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
