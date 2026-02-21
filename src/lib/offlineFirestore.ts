/**
 * Offline-aware Firestore operations
 * Automatically queues operations when offline
 */

import { QueuedOperation } from './indexedDB';

type OfflineQueueHook = {
    addToQueue: (operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>) => Promise<void>;
    isOnline: boolean;
};

/**
 * Wrap a Firestore operation to support offline queueing
 * If online, executes immediately. If offline, adds to queue.
 */
export async function withOfflineSupport<T>(
    operation: () => Promise<T>,
    queueData: {
        type: 'create' | 'update' | 'delete';
        collection: 'transactions' | 'accounts' | 'budgets' | 'debts';
        data: any;
    },
    offlineQueue: OfflineQueueHook
): Promise<T | void> {
    if (offlineQueue.isOnline) {
        // Execute immediately if online
        return await operation();
    } else {
        // Queue for later if offline
        await offlineQueue.addToQueue(queueData);
        console.log('Operation queued for offline sync:', queueData);
    }
}
