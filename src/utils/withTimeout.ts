/**
 * Envuelve una promesa con un timeout. Si no resuelve dentro de `ms`,
 * rechaza con un Error de timeout. Útil para llamadas de red (Gemini) que
 * pueden colgarse y bloquear flujos como la importación.
 *
 * Nota: el trabajo subyacente puede seguir corriendo; esto solo libera al
 * llamador para que aplique su fallback.
 */
export class TimeoutError extends Error {
  constructor(ms: number, label?: string) {
    super(`Tiempo de espera agotado${label ? ` (${label})` : ''} tras ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms, label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
