/**
 * Redacción de datos sensibles para logging/telemetría (S7/S-error-redact).
 *
 * Módulo compartido por el logger (consola) y el errorReporter (telemetría
 * externa) para que AMBAS rutas redacten los mismos campos antes de que salgan
 * del dispositivo. Conserva ids/tipos/conteos para poder depurar sin exponer
 * montos, descripciones ni la API key.
 *
 * No importa nada del proyecto: evita ciclos (logger ↔ errorReporter).
 */

/**
 * Campos sensibles que NO deben llegar a consola ni a un servicio de monitoreo.
 */
export const SENSITIVE_KEYS = new Set<string>([
  'amount', 'originalAmount', 'monthlyInstallmentAmount', 'totalInterestAmount',
  'remainingAmount', 'declaredIncome', 'monthlyLimit', 'currentAmount', 'targetAmount',
  'initialBalance', 'balance', 'usedCredit', 'creditLimit', 'lastPaidAmount',
  'description', 'notes', 'personName', 'title', 'message', 'raw', 'geminiApiKey', 'apiKey',
]);

const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const REDACTED = '[redacted]';

/** Redacta recursivamente los campos sensibles de un valor para logging seguro. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[depth-limit]';

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitize(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`…(+${value.length - MAX_ARRAY_ITEMS} more)`);
    return items;
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = val == null ? val : REDACTED;
    } else {
      out[key] = sanitize(val, depth + 1);
    }
  }
  return out;
}

/** Redacta un objeto de contexto (devuelve undefined si no hay contexto). */
export function sanitizeContext(
  context?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  return sanitize(context) as Record<string, unknown>;
}
