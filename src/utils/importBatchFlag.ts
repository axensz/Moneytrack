/**
 * Simple flag to suppress individual notifications during batch imports.
 * When active, useNotificationMonitoring skips per-transaction alerts
 * and the import hook generates a single summary notification at the end.
 *
 * Also tracks IDs of recently imported transactions so that even if the flag
 * is cleared before all Firestore snapshots arrive, those transactions won't
 * trigger individual notifications.
 */

let _isBatchImporting = false;

/** IDs of transactions imported in the most recent batch */
const _importedIds: Set<string> = new Set();

/** Timestamp when the last import finished — used as a grace period */
let _importFinishedAt = 0;

/** Grace period (ms) after import finishes where new transactions are still suppressed */
const GRACE_PERIOD_MS = 15_000;

export function setBatchImporting(value: boolean): void {
    _isBatchImporting = value;
    if (!value) {
        _importFinishedAt = Date.now();
    }
}

export function isBatchImporting(): boolean {
    return _isBatchImporting;
}

/**
 * Returns true if notifications should be suppressed for this transaction.
 * Checks: active batch flag, grace period after import, or ID in recent import set.
 */
export function shouldSuppressNotification(transactionId?: string): boolean {
    if (_isBatchImporting) return true;

    // Within grace period after import finished
    if (Date.now() - _importFinishedAt < GRACE_PERIOD_MS) return true;

    // Transaction was part of the last import batch
    if (transactionId && _importedIds.has(transactionId)) return true;

    return false;
}

/**
 * Register IDs of imported transactions so they can be suppressed
 * even after the batch flag is cleared.
 */
export function registerImportedIds(ids: string[]): void {
    ids.forEach(id => _importedIds.add(id));
    // Auto-clear after 60 seconds to avoid memory leak
    setTimeout(() => {
        ids.forEach(id => _importedIds.delete(id));
    }, 60_000);
}

/**
 * Clear all imported IDs (e.g., on user logout)
 */
export function clearImportedIds(): void {
    _importedIds.clear();
    _importFinishedAt = 0;
}
