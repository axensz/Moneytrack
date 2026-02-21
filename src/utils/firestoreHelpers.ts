/**
 * Helpers para operaciones Firestore con validación de red y retry logic
 */

import { showToast } from './toastHelpers';
import { logger } from './logger';

interface RetryOptions {
    maxRetries?: number;
    delayMs?: number;
    exponentialBackoff?: boolean;
}

/**
 * Verifica si hay conexión a internet antes de ejecutar operación
 */
export function checkNetworkConnection(): boolean {
    if (typeof navigator === 'undefined') return true;

    if (!navigator.onLine) {
        showToast.error('Sin conexión a internet. Verifica tu conexión e intenta de nuevo.');
        return false;
    }

    return true;
}

/**
 * Ejecuta una operación Firestore con retry logic automático
 * 
 * @param operation - Función asíncrona a ejecutar
 * @param options - Opciones de retry
 * @returns Resultado de la operación
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxRetries = 3,
        delayMs = 1000,
        exponentialBackoff = true
    } = options;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;

            // Si es el último intento, lanzar el error
            if (attempt === maxRetries) {
                break;
            }

            // Verificar si es un error de red
            const isNetworkError =
                error instanceof Error &&
                (error.message.includes('network') ||
                    error.message.includes('offline') ||
                    error.message.includes('Failed to fetch'));

            if (isNetworkError) {
                logger.warn(`Intento ${attempt + 1}/${maxRetries + 1} falló por error de red. Reintentando...`);

                // Calcular delay con backoff exponencial si está habilitado
                const delay = exponentialBackoff
                    ? delayMs * Math.pow(2, attempt)
                    : delayMs;

                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // Si no es error de red, no reintentar
                break;
            }
        }
    }

    // Si llegamos aquí, todos los intentos fallaron
    throw lastError;
}

/**
 * Wrapper para operaciones Firestore con validación de red y retry
 * 
 * @param operation - Operación Firestore a ejecutar
 * @param operationName - Nombre de la operación para logging
 * @param options - Opciones de retry
 */
export async function safeFirestoreOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    options?: RetryOptions
): Promise<T> {
    // Verificar conexión antes de intentar
    if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
    }

    try {
        return await withRetry(operation, options);
    } catch (error) {
        logger.error(`Error en operación Firestore: ${operationName}`, error);
        throw error;
    }
}

/**
 * Verifica si un error es recuperable (puede reintentar)
 */
export function isRecoverableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const recoverableMessages = [
        'network',
        'offline',
        'timeout',
        'Failed to fetch',
        'unavailable',
        'UNAVAILABLE'
    ];

    return recoverableMessages.some(msg =>
        error.message.toLowerCase().includes(msg.toLowerCase())
    );
}
