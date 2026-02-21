'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNetworkStatus } from './useNetworkStatus';
import {
    QueuedOperation,
    addToQueue as addToIndexedDB,
    getQueue,
    removeMultipleFromQueue,
    updateInQueue,
} from '@/lib/indexedDB';
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Hook for managing offline operations queue
 * Automatically syncs when network is restored
 */
export function useOfflineQueue() {
    const [queue, setQueue] = useState<QueuedOperation[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const isOnline = useNetworkStatus();

    // Load queue from IndexedDB on mount
    useEffect(() => {
        loadQueue();
    }, []);

    // Sync when coming back online
    useEffect(() => {
        if (isOnline && queue.length > 0 && !isSyncing) {
            syncQueue();
        }
    }, [isOnline, queue.length]);

    /**
     * Load queue from IndexedDB
     */
    const loadQueue = async () => {
        try {
            const operations = await getQueue();
            setQueue(operations);
        } catch (error) {
            console.error('Failed to load offline queue:', error);
        }
    };

    /**
     * Add operation to queue
     */
    const addToQueue = useCallback(
        async (
            operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>
        ) => {
            const queuedOp: QueuedOperation = {
                ...operation,
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                timestamp: Date.now(),
                retryCount: 0,
            };

            try {
                await addToIndexedDB(queuedOp);
                setQueue((prev) => [...prev, queuedOp]);
                console.log('Operation added to offline queue:', queuedOp);
            } catch (error) {
                console.error('Failed to add operation to queue:', error);
                throw error;
            }
        },
        []
    );

    /**
     * Execute a single queued operation
     */
    const executeOperation = async (
        operation: QueuedOperation
    ): Promise<void> => {
        const { type, collection: collectionName, data } = operation;

        try {
            const collectionRef = collection(db, collectionName);

            switch (type) {
                case 'create':
                    await addDoc(collectionRef, data);
                    console.log(`Created ${collectionName} document:`, data);
                    break;

                case 'update':
                    if (!data.id) {
                        throw new Error('Update operation requires document ID');
                    }
                    const updateDocRef = doc(db, collectionName, data.id);
                    const { id, ...updateData } = data;
                    await updateDoc(updateDocRef, updateData);
                    console.log(`Updated ${collectionName} document:`, data.id);
                    break;

                case 'delete':
                    if (!data.id) {
                        throw new Error('Delete operation requires document ID');
                    }
                    const deleteDocRef = doc(db, collectionName, data.id);
                    await deleteDoc(deleteDocRef);
                    console.log(`Deleted ${collectionName} document:`, data.id);
                    break;

                default:
                    throw new Error(`Unknown operation type: ${type}`);
            }
        } catch (error) {
            console.error('Failed to execute operation:', error);

            // Update retry count
            operation.retryCount++;
            operation.lastError = error instanceof Error ? error.message : 'Unknown error';

            if (operation.retryCount < 3) {
                await updateInQueue(operation);
            }

            throw error;
        }
    };

    /**
     * Sync all queued operations
     */
    const syncQueue = useCallback(async () => {
        if (isSyncing || queue.length === 0) return;

        setIsSyncing(true);
        console.log(`Syncing ${queue.length} queued operations...`);

        const results = await Promise.allSettled(
            queue.map((op) => executeOperation(op))
        );

        // Collect successful operation IDs
        const successfulIds: string[] = [];
        const failedOps: QueuedOperation[] = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                successfulIds.push(queue[index].id);
            } else {
                failedOps.push(queue[index]);
            }
        });

        // Remove successful operations from queue
        if (successfulIds.length > 0) {
            try {
                await removeMultipleFromQueue(successfulIds);
                setQueue((prev) => prev.filter((op) => !successfulIds.includes(op.id)));
                console.log(`Successfully synced ${successfulIds.length} operations`);
            } catch (error) {
                console.error('Failed to remove operations from queue:', error);
            }
        }

        if (failedOps.length > 0) {
            console.warn(`${failedOps.length} operations failed to sync`);
        }

        setIsSyncing(false);
    }, [queue, isSyncing]);

    /**
     * Manually retry sync
     */
    const retrySync = useCallback(() => {
        if (isOnline) {
            syncQueue();
        }
    }, [isOnline, syncQueue]);

    return {
        queue,
        addToQueue,
        syncQueue,
        retrySync,
        isSyncing,
        queueLength: queue.length,
        isOnline,
    };
}
