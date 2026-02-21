import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    checkNetworkConnection,
    withRetry,
    safeFirestoreOperation,
    isRecoverableError
} from '../../utils/firestoreHelpers';
import * as toastHelpers from '../../utils/toastHelpers';

// Mock toast helpers
vi.mock('../../utils/toastHelpers', () => ({
    showToast: {
        error: vi.fn(),
        success: vi.fn(),
    }
}));

describe('firestoreHelpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('checkNetworkConnection', () => {
        it('returns true when navigator.onLine is true', () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true
            });

            expect(checkNetworkConnection()).toBe(true);
            expect(toastHelpers.showToast.error).not.toHaveBeenCalled();
        });

        it('returns false and shows error when navigator.onLine is false', () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: false
            });

            expect(checkNetworkConnection()).toBe(false);
            expect(toastHelpers.showToast.error).toHaveBeenCalledWith(
                'Sin conexión a internet. Verifica tu conexión e intenta de nuevo.'
            );
        });
    });

    describe('withRetry', () => {
        it('returns result on first successful attempt', async () => {
            const operation = vi.fn().mockResolvedValue('success');

            const result = await withRetry(operation);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('retries on network error and eventually succeeds', async () => {
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('network error'))
                .mockResolvedValueOnce('success');

            const result = await withRetry(operation, { maxRetries: 2, delayMs: 10 });

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('throws error after max retries exceeded', async () => {
            const operation = vi.fn().mockRejectedValue(new Error('network error'));

            await expect(
                withRetry(operation, { maxRetries: 2, delayMs: 10 })
            ).rejects.toThrow('network error');

            expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
        });

        it('does not retry on non-network errors', async () => {
            const operation = vi.fn().mockRejectedValue(new Error('validation error'));

            await expect(
                withRetry(operation, { maxRetries: 2, delayMs: 10 })
            ).rejects.toThrow('validation error');

            expect(operation).toHaveBeenCalledTimes(1); // no retries
        });

        it('uses exponential backoff when enabled', async () => {
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('network error'))
                .mockRejectedValueOnce(new Error('network error'))
                .mockResolvedValueOnce('success');

            const startTime = Date.now();
            await withRetry(operation, {
                maxRetries: 2,
                delayMs: 100,
                exponentialBackoff: true
            });
            const endTime = Date.now();

            // Should take at least 100ms + 200ms = 300ms
            expect(endTime - startTime).toBeGreaterThanOrEqual(250);
            expect(operation).toHaveBeenCalledTimes(3);
        });
    });

    describe('safeFirestoreOperation', () => {
        beforeEach(() => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true
            });
        });

        it('executes operation successfully when online', async () => {
            const operation = vi.fn().mockResolvedValue('result');

            const result = await safeFirestoreOperation(operation, 'testOp');

            expect(result).toBe('result');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('throws error when offline', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: false
            });

            const operation = vi.fn().mockResolvedValue('result');

            await expect(
                safeFirestoreOperation(operation, 'testOp')
            ).rejects.toThrow('Sin conexión a internet');

            expect(operation).not.toHaveBeenCalled();
        });

        it('retries operation with provided options', async () => {
            const operation = vi.fn()
                .mockRejectedValueOnce(new Error('network error'))
                .mockResolvedValueOnce('success');

            const result = await safeFirestoreOperation(
                operation,
                'testOp',
                { maxRetries: 2, delayMs: 10 }
            );

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });
    });

    describe('isRecoverableError', () => {
        it('returns true for network errors', () => {
            expect(isRecoverableError(new Error('network timeout'))).toBe(true);
            expect(isRecoverableError(new Error('offline'))).toBe(true);
            expect(isRecoverableError(new Error('Failed to fetch'))).toBe(true);
            expect(isRecoverableError(new Error('UNAVAILABLE'))).toBe(true);
        });

        it('returns false for non-network errors', () => {
            expect(isRecoverableError(new Error('validation failed'))).toBe(false);
            expect(isRecoverableError(new Error('permission denied'))).toBe(false);
        });

        it('returns false for non-Error objects', () => {
            expect(isRecoverableError('string error')).toBe(false);
            expect(isRecoverableError(null)).toBe(false);
            expect(isRecoverableError(undefined)).toBe(false);
            expect(isRecoverableError(123)).toBe(false);
        });
    });
});
