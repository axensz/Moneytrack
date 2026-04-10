/**
 * Simple flag to suppress individual notifications during batch imports.
 * When active, useNotificationMonitoring skips per-transaction alerts
 * and the import hook generates a single summary notification at the end.
 */

let _isBatchImporting = false;

export function setBatchImporting(value: boolean): void {
    _isBatchImporting = value;
}

export function isBatchImporting(): boolean {
    return _isBatchImporting;
}
