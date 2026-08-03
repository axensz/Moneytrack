/**
 * Hook para almacenamiento de notificaciones
 * Soporta Firebase (usuario autenticado) y localStorage (modo invitado)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    collection,
    onSnapshot,
    query,
    orderBy,
    limit as firestoreLimit,
    updateDoc,
    deleteDoc,
    doc,
    writeBatch,
    setDoc,
    runTransaction,
    getDoc,
    getDocs,
    startAfter,
    documentId,
} from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { ensureDate, localDateKey } from '../utils/dateUtils';
import { db } from '../lib/firebaseDb';
import { useLocalStorage } from './useLocalStorage';
import { logger } from '../utils/logger';
import type { Notification } from '../types/finance';
import { RULE_SAFE_SIMPLE_WRITE_LIMIT } from '../config/firestoreLimits';
import {
    advanceVersionedNotification,
    eventDocumentId,
    getCanonicalEventRevision,
    isNotificationDismissed,
    isNotificationRead,
    isVersionedEventCandidate,
    isVersionedNotification,
} from '../utils/notificationEventLifecycle';

const MAX_NOTIFICATIONS = 100;
const PRUNE_DAYS = 30;
const READ_PAGE_SIZE = 499;
// Los writes en lote comparten el límite de 1.000 expresiones de reglas.

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

type StoredNotificationDocument = {
    id: string;
    isRead: boolean;
    createdAt?: Date;
    schemaVersion?: number;
    revision?: number;
    readRevision?: number;
};

type EventRevisionState = {
    confirmed: number;
    pending: Map<symbol, number>;
};

const effectiveEventRevision = (state: EventRevisionState): number => {
    let revision = state.confirmed;
    state.pending.forEach((pendingRevision) => {
        revision = Math.max(revision, pendingRevision);
    });
    return revision;
};

const releaseEventRevisionReservation = (
    states: Map<string, EventRevisionState>,
    eventKey: string,
    state: EventRevisionState,
    reservation: symbol,
    rawRevision: number,
    confirmedRevision?: number,
): void => {
    state.pending.delete(reservation);
    if (confirmedRevision !== undefined) {
        state.confirmed = Math.max(state.confirmed, confirmedRevision);
    }
    if (
        state.pending.size === 0
        && state.confirmed === rawRevision
        && states.get(eventKey) === state
    ) {
        states.delete(eventKey);
    }
};

const isVersionedStoredDocument = (notification: StoredNotificationDocument): boolean =>
    notification.schemaVersion === 2
    && Number.isInteger(notification.revision)
    && notification.revision! > 0;

export function useNotificationStore(userId: string | null, externalNotifications?: Notification[]) {
    // Firestore state (only used if no external data)
    const [firestoreNotifications, setFirestoreNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<Set<string>>(() => new Set());
    const [optimisticReadIds, setOptimisticReadIds] = useState<Set<string>>(() => new Set());
    const [optimisticReadRevisions, setOptimisticReadRevisions] = useState<Map<string, number>>(() => new Map());
    const [optimisticDismissedRevisions, setOptimisticDismissedRevisions] = useState<Map<string, number>>(() => new Map());

    // Ref to avoid recreating addNotification on every snapshot update
    const firestoreNotificationsRef = useRef<Notification[]>([]);
    const visibleNotificationsRef = useRef<Notification[]>([]);
    const eventRevisionStatesRef = useRef<Map<string, EventRevisionState>>(new Map());

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

    sourceNotifications.forEach((notification) => {
        if (!isVersionedNotification(notification)) return;
        const state = eventRevisionStatesRef.current.get(notification.eventKey);
        if (!state) return;

        state.confirmed = Math.max(state.confirmed, notification.revision);
        if (state.pending.size === 0 && state.confirmed === notification.revision) {
            eventRevisionStatesRef.current.delete(notification.eventKey);
        }
    });

    // Usar Firebase si hay usuario, localStorage si no
    const notifications = useMemo(
        () => sourceNotifications
            .filter((n) => !n.id || !optimisticDeletedIds.has(n.id))
            .filter((n) => !isNotificationDismissed(n))
            .filter((n) => !(
                n.id
                && isVersionedNotification(n)
                && optimisticDismissedRevisions.get(n.id) === n.revision
            ))
            .map((n) => {
                if (n.id && isVersionedNotification(n)) {
                    return optimisticReadRevisions.get(n.id) === n.revision && !isNotificationRead(n)
                        ? { ...n, isRead: true, readRevision: n.revision }
                        : n;
                }
                return n.id && optimisticReadIds.has(n.id) && !n.isRead
                    ? { ...n, isRead: true }
                    : n;
            }),
        [
            sourceNotifications,
            optimisticDeletedIds,
            optimisticReadIds,
            optimisticReadRevisions,
            optimisticDismissedRevisions,
        ]
    );

    firestoreNotificationsRef.current = sourceNotifications;
    visibleNotificationsRef.current = notifications;

    useEffect(() => {
        if (!userId) {
            setOptimisticDeletedIds((current) => current.size === 0 ? current : new Set());
            setOptimisticReadIds((current) => current.size === 0 ? current : new Set());
            setOptimisticReadRevisions((current) => current.size === 0 ? current : new Map());
            setOptimisticDismissedRevisions((current) => current.size === 0 ? current : new Map());
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
        setOptimisticReadRevisions((current) => {
            if (current.size === 0) return current;
            const next = new Map(current);
            let changed = false;
            current.forEach((optimisticRevision, id) => {
                const notification = sourceNotifications.find((item) => item.id === id);
                if (
                    !isVersionedNotification(notification)
                    || notification.revision !== optimisticRevision
                    || isNotificationRead(notification)
                ) {
                    next.delete(id);
                    changed = true;
                }
            });
            return changed ? next : current;
        });
        setOptimisticDismissedRevisions((current) => {
            if (current.size === 0) return current;
            const next = new Map(current);
            let changed = false;
            current.forEach((optimisticRevision, id) => {
                const notification = sourceNotifications.find((item) => item.id === id);
                if (
                    !isVersionedNotification(notification)
                    || notification.revision !== optimisticRevision
                    || isNotificationDismissed(notification)
                ) {
                    next.delete(id);
                    changed = true;
                }
            });
            return changed ? next : current;
        });
    }, [userId, sourceNotifications]);

    // ✅ FIX #2: Generar docId determinístico para deduplicación
    const generateDedupeDocId = useCallback((notification: Omit<Notification, 'id' | 'createdAt'>): string => {
        if (isVersionedEventCandidate(notification as Notification)) {
            return eventDocumentId(notification.eventKey!);
        }
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
            const now = new Date();
            if (isVersionedEventCandidate(notification as Notification)) {
                const currentNotifications = userId
                    ? firestoreNotificationsRef.current
                    : localNotificationsRef.current;
                const current = currentNotifications.find((existing) =>
                    isVersionedNotification(existing) && existing.eventKey === notification.eventKey
                );
                const candidate = {
                    ...notification,
                    createdAt: now,
                } as Notification;
                const candidateRevision = getCanonicalEventRevision(candidate);
                if (candidateRevision === null) return false;
                candidate.revision = candidateRevision;
                const eventKey = candidate.eventKey!;
                const rawRevision = current?.revision ?? 0;
                let revisionState = eventRevisionStatesRef.current.get(eventKey);
                if (!revisionState) {
                    revisionState = { confirmed: rawRevision, pending: new Map() };
                    eventRevisionStatesRef.current.set(eventKey, revisionState);
                } else {
                    revisionState.confirmed = Math.max(revisionState.confirmed, rawRevision);
                }
                if (candidateRevision <= effectiveEventRevision(revisionState)) return false;

                // Cada intento conserva su propia reserva hasta que persiste o falla.
                const reservation = Symbol(eventKey);
                revisionState.pending.set(reservation, candidateRevision);
                const next = advanceVersionedNotification(current, candidate);
                if (next === current) {
                    releaseEventRevisionReservation(
                        eventRevisionStatesRef.current,
                        eventKey,
                        revisionState,
                        reservation,
                        rawRevision,
                    );
                    return false;
                }

                const id = current?.id ?? generateDedupeDocId(notification);

                if (userId) {
                    try {
                        const result = await runTransaction(db, async (transaction) => {
                            const ref = doc(db, `users/${userId}/notifications`, id);
                            const snapshot = await transaction.get(ref);
                            const persisted = snapshot.exists()
                                ? { ...snapshot.data(), id } as Notification
                                : undefined;
                            const nextPersisted = advanceVersionedNotification(persisted, candidate);
                            if (nextPersisted === persisted) {
                                return { written: false, revision: persisted?.revision ?? 0 };
                            }

                            const data = { ...nextPersisted };
                            delete data.id;
                            transaction.set(ref, data);
                            return { written: true, revision: nextPersisted.revision ?? candidateRevision };
                        });
                        releaseEventRevisionReservation(
                            eventRevisionStatesRef.current,
                            eventKey,
                            revisionState,
                            reservation,
                            rawRevision,
                            result.revision,
                        );
                        return result.written;
                    } catch (error) {
                        releaseEventRevisionReservation(
                            eventRevisionStatesRef.current,
                            eventKey,
                            revisionState,
                            reservation,
                            rawRevision,
                        );
                        throw error;
                    }
                } else {
                    const stored: Notification = { ...next, id };
                    const updated = [stored, ...localNotificationsRef.current.filter((existing) => existing.id !== id)]
                        .slice(0, MAX_NOTIFICATIONS);
                    setLocalNotifications(updated);
                    releaseEventRevisionReservation(
                        eventRevisionStatesRef.current,
                        eventKey,
                        revisionState,
                        reservation,
                        rawRevision,
                        next.revision ?? candidateRevision,
                    );
                }
                return true;
            }

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
                        createdAt: now,
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
                    createdAt: now,
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
                const current = previousNotifications.find((notification) => notification.id === id);

                if (hasExternalNotifications) {
                    if (isVersionedNotification(current) && updates.readRevision === current.revision) {
                        setOptimisticReadRevisions((revisions) => {
                            const next = new Map(revisions);
                            next.set(id, current.revision!);
                            return next;
                        });
                    } else if (isVersionedNotification(current) && updates.dismissedRevision === current.revision) {
                        setOptimisticDismissedRevisions((revisions) => {
                            const next = new Map(revisions);
                            next.set(id, current.revision!);
                            return next;
                        });
                    } else if (updates.isRead === true) {
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
                        if (isVersionedNotification(current) && updates.readRevision === current.revision) {
                            setOptimisticReadRevisions((revisions) => {
                                const next = new Map(revisions);
                                next.delete(id);
                                return next;
                            });
                        } else if (isVersionedNotification(current) && updates.dismissedRevision === current.revision) {
                            setOptimisticDismissedRevisions((revisions) => {
                                const next = new Map(revisions);
                                next.delete(id);
                                return next;
                            });
                        } else if (updates.isRead === true) {
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
        async (id: string, expectedRevision?: number) => {
            const ref = userId ? doc(db, `users/${userId}/notifications`, id) : undefined;
            let current = firestoreNotificationsRef.current.find((notification) => notification.id === id);

            if (userId && !current) {
                const snapshot = await getDoc(ref!);
                if (!snapshot.exists()) return;
                current = { ...snapshot.data(), id } as Notification;
            }

            if (isVersionedNotification(current)) {
                const revision = expectedRevision ?? current.revision;
                if (revision !== current.revision) return;
                const now = new Date();
                const visible = visibleNotificationsRef.current.find((notification) => notification.id === id);
                const hasVisibleRevision = isVersionedNotification(visible) && visible.revision === revision;

                if (userId) {
                    const rollbackDismissal = () => {
                        if (hasExternalNotifications) {
                            setOptimisticDismissedRevisions((revisions) => {
                                if (revisions.get(id) !== revision) return revisions;
                                const next = new Map(revisions);
                                next.delete(id);
                                return next;
                            });
                        } else if (hasVisibleRevision) {
                            setFirestoreNotifications((notifications) => notifications.map((notification) => {
                                if (!isVersionedNotification(notification) || notification.id !== id || notification.revision !== revision) {
                                    return notification;
                                }
                                return { ...notification, dismissedRevision: undefined, dismissedAt: undefined };
                            }));
                        }
                    };

                    if (hasExternalNotifications && hasVisibleRevision) {
                        setOptimisticDismissedRevisions((revisions) => new Map(revisions).set(id, revision));
                    } else if (!hasExternalNotifications && hasVisibleRevision) {
                        setFirestoreNotifications((notifications) => notifications.map((notification) =>
                            notification.id === id
                                ? { ...notification, dismissedRevision: revision, dismissedAt: now }
                                : notification
                        ));
                    }

                    try {
                        const dismissed = await runTransaction(db, async (transaction) => {
                            const snapshot = await transaction.get(ref!);
                            if (!snapshot.exists()) return false;
                            const persisted = { ...snapshot.data(), id } as Notification;
                            if (!isVersionedNotification(persisted) || persisted.revision !== revision) return false;
                            transaction.update(ref!, { dismissedRevision: revision, dismissedAt: now });
                            return true;
                        });
                        if (dismissed) return;
                    } catch (error) {
                        rollbackDismissal();
                        throw error;
                    }

                    rollbackDismissal();
                    return;
                }

                setLocalNotifications((notifications) => notifications.map((notification) =>
                    notification.id === id
                        ? { ...notification, dismissedRevision: revision, dismissedAt: now }
                        : notification
                ));
                return;
            }

            // Absence is not proof of legacy. A physical delete needs a confirmed legacy document.
            if (!current) return;

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

    // Read the complete collection, not only the visible 100-document window.
    const readAllNotificationDocuments = useCallback(async (): Promise<
        StoredNotificationDocument[]
    > => {
        if (!userId) return [];

        const notificationsRef = collection(db, `users/${userId}/notifications`);
        const documents: StoredNotificationDocument[] = [];
        let cursor: QueryDocumentSnapshot<DocumentData> | undefined;

        while (true) {
            const pageQuery = cursor
                ? query(
                    notificationsRef,
                    orderBy(documentId()),
                    startAfter(cursor),
                    firestoreLimit(READ_PAGE_SIZE)
                )
                : query(
                    notificationsRef,
                    orderBy(documentId()),
                    firestoreLimit(READ_PAGE_SIZE)
                );
            const snapshot = await getDocs(pageQuery);

            snapshot.docs.forEach((notificationDoc) => {
                const data = notificationDoc.data();
                documents.push({
                    id: notificationDoc.id,
                    isRead: data.isRead === true,
                    createdAt: data.createdAt ? ensureDate(data.createdAt) : undefined,
                    schemaVersion: data.schemaVersion,
                    revision: data.revision,
                    readRevision: data.readRevision,
                });
            });

            if (snapshot.docs.length < READ_PAGE_SIZE) break;
            cursor = snapshot.docs[snapshot.docs.length - 1];
        }

        return documents;
    }, [userId]);

    const commitInBatches = useCallback(async (
        operations: Array<{ type: 'delete' | 'update'; id: string; data?: Record<string, unknown> }>
    ) => {
        for (let i = 0; i < operations.length; i += RULE_SAFE_SIMPLE_WRITE_LIMIT) {
            const chunk = operations.slice(i, i + RULE_SAFE_SIMPLE_WRITE_LIMIT);
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

    // Prune the complete Firestore collection after the initial snapshot settles.
    // The visible subscription is intentionally capped at 100, so it cannot be
    // used as the source of truth for retention.
    useEffect(() => {
        if (loading) return;

        const pruneOldNotifications = async () => {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - PRUNE_DAYS);

            if (userId) {
                try {
                    const storedNotifications = await readAllNotificationDocuments();
                    const operations = storedNotifications
                        .filter(
                            (notification) =>
                                !isVersionedStoredDocument(notification)
                                && notification.createdAt
                                && notification.createdAt < cutoffDate
                        )
                        .map((notification) => ({
                            type: 'delete' as const,
                            id: notification.id,
                        }));

                    await commitInBatches(operations);
                    if (operations.length > 0) {
                        logger.info(`Pruned ${operations.length} old notifications`);
                    }
                } catch (error) {
                    logger.error('Failed to prune old notifications', error);
                }
                return;
            }

            const currentLocalNotifications = localNotificationsRef.current;
            const freshNotifications = currentLocalNotifications.filter(
                (notification) =>
                    isVersionedNotification(notification)
                    || (notification.createdAt && ensureDate(notification.createdAt) >= cutoffDate)
            );
            if (freshNotifications.length !== currentLocalNotifications.length) {
                setLocalNotifications(freshNotifications);
                logger.info(
                    `Pruned ${currentLocalNotifications.length - freshNotifications.length} old notifications`
                );
            }
        };

        void pruneOldNotifications();
    }, [
        userId,
        loading,
        setLocalNotifications,
        readAllNotificationDocuments,
        commitInBatches,
    ]);

    // Clear all notifications con optimistic update (fix #8: chunked batches)
    const clearAll = useCallback(async () => {
        if (userId) {
            const currentNotifications = visibleNotificationsRef.current;
            const previousNotifications = [...currentNotifications];
            const legacyVisibleIds = notificationIds(previousNotifications.filter((n) => !isVersionedNotification(n)));
            const versionedVisible = previousNotifications.filter(isVersionedNotification);
            const now = new Date();

            if (hasExternalNotifications) {
                setOptimisticDeletedIds((current) => addOptimisticIds(current, legacyVisibleIds));
                setOptimisticDismissedRevisions((current) => {
                    const next = new Map(current);
                    versionedVisible.forEach((notification) => next.set(notification.id!, notification.revision));
                    return next;
                });
            } else {
                setFirestoreNotifications((current) => current.flatMap((notification) =>
                    isVersionedNotification(notification)
                        ? [{ ...notification, dismissedRevision: notification.revision, dismissedAt: now }]
                        : []
                ));
            }

            try {
                const storedNotifications = await readAllNotificationDocuments();
                const ops = storedNotifications.map((notification) =>
                    isVersionedStoredDocument(notification)
                        ? {
                            type: 'update' as const,
                            id: notification.id,
                            data: { dismissedRevision: notification.revision, dismissedAt: now },
                        }
                        : { type: 'delete' as const, id: notification.id }
                );
                await commitInBatches(ops);
                logger.info(`All notifications cleared successfully (${ops.length})`);
            } catch (error) {
                if (hasExternalNotifications) {
                    setOptimisticDeletedIds((current) => removeOptimisticIds(current, legacyVisibleIds));
                    setOptimisticDismissedRevisions((current) => {
                        const next = new Map(current);
                        versionedVisible.forEach((notification) => next.delete(notification.id!));
                        return next;
                    });
                } else {
                    setFirestoreNotifications(previousNotifications);
                }
                logger.error('Failed to clear all notifications', error);
                throw error;
            }
        } else {
            const now = new Date();
            setLocalNotifications((current) => current.flatMap((notification) =>
                isVersionedNotification(notification)
                    ? [{ ...notification, dismissedRevision: notification.revision, dismissedAt: now }]
                    : []
            ));
        }
    }, [
        userId,
        hasExternalNotifications,
        setLocalNotifications,
        readAllNotificationDocuments,
        commitInBatches,
    ]);

    // Mark all as read con optimistic update (fix #8: chunked batches)
    const markAllAsRead = useCallback(async () => {
        if (userId) {
            const currentNotifications = visibleNotificationsRef.current;
            const unreadNotifications = currentNotifications.filter((n) => !isNotificationRead(n));
            const previousNotifications = [...currentNotifications];
            const legacyUnreadIds = notificationIds(unreadNotifications.filter((n) => !isVersionedNotification(n)));
            const versionedUnread = unreadNotifications.filter(isVersionedNotification);

            if (hasExternalNotifications) {
                setOptimisticReadIds((current) => addOptimisticIds(current, legacyUnreadIds));
                setOptimisticReadRevisions((current) => {
                    const next = new Map(current);
                    versionedUnread.forEach((notification) => next.set(notification.id!, notification.revision));
                    return next;
                });
            } else {
                setFirestoreNotifications((current) => current.map((notification) =>
                    isVersionedNotification(notification)
                        ? { ...notification, isRead: true, readRevision: notification.revision }
                        : { ...notification, isRead: true }
                ));
            }

            try {
                const storedNotifications = await readAllNotificationDocuments();
                const ops = storedNotifications
                    .filter((notification) => isVersionedStoredDocument(notification)
                        ? notification.readRevision !== notification.revision
                        : !notification.isRead)
                    .map((notification) => ({
                        type: 'update' as const,
                        id: notification.id,
                        data: isVersionedStoredDocument(notification)
                            ? { isRead: true, readRevision: notification.revision }
                            : { isRead: true },
                    }));
                await commitInBatches(ops);
                logger.info(`Marked ${ops.length} notifications as read`);
            } catch (error) {
                if (hasExternalNotifications) {
                    setOptimisticReadIds((current) => removeOptimisticIds(current, legacyUnreadIds));
                    setOptimisticReadRevisions((current) => {
                        const next = new Map(current);
                        versionedUnread.forEach((notification) => next.delete(notification.id!));
                        return next;
                    });
                } else {
                    setFirestoreNotifications(previousNotifications);
                }
                logger.error('Failed to mark all as read', error);
                throw error;
            }
        } else {
            setLocalNotifications((current) => current.map((notification) =>
                isVersionedNotification(notification)
                    ? { ...notification, isRead: true, readRevision: notification.revision }
                    : { ...notification, isRead: true }
            ));
        }
    }, [
        userId,
        hasExternalNotifications,
        setLocalNotifications,
        readAllNotificationDocuments,
        commitInBatches,
    ]);

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
