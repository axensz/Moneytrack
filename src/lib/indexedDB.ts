/**
 * IndexedDB utility for offline queue management
 */

const DB_NAME = 'moneytrack-offline';
const DB_VERSION = 1;
const STORE_NAME = 'offline-queue';

export interface QueuedOperation {
    id: string;
    type: 'create' | 'update' | 'delete';
    collection: 'transactions' | 'accounts' | 'budgets' | 'debts';
    data: any;
    timestamp: number;
    retryCount: number;
    lastError?: string;
}

/**
 * Initialize IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !('indexedDB' in window)) {
            reject(new Error('IndexedDB not supported'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Create object store if it doesn't exist
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('collection', 'collection', { unique: false });
            }
        };
    });
}

/**
 * Add operation to queue
 */
export async function addToQueue(operation: QueuedOperation): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(operation);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all queued operations
 */
export async function getQueue(): Promise<QueuedOperation[]> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Remove operation from queue
 */
export async function removeFromQueue(id: string): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Remove multiple operations from queue
 */
export async function removeMultipleFromQueue(ids: string[]): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        let completed = 0;
        let hasError = false;

        ids.forEach((id) => {
            const request = store.delete(id);

            request.onsuccess = () => {
                completed++;
                if (completed === ids.length && !hasError) {
                    resolve();
                }
            };

            request.onerror = () => {
                hasError = true;
                reject(request.error);
            };
        });

        if (ids.length === 0) {
            resolve();
        }
    });
}

/**
 * Update operation in queue
 */
export async function updateInQueue(operation: QueuedOperation): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(operation);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Clear all queued operations
 */
export async function clearQueue(): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get queue size
 */
export async function getQueueSize(): Promise<number> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
