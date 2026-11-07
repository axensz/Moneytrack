import type { Account, Transaction } from '../types/finance';
import type {
  PaymentInstrument,
  PendingTransactionImportCandidate,
} from '../types/transactionImport';
import { matchPaymentInstrument } from './paymentInstrumentMatching';

/**
 * Auto-confirmación de candidatos de importación (capturas wallet/Android).
 *
 * DECISIÓN DE DISEÑO EXPLÍCITA DEL USUARIO (no es un bugfix):
 * Históricamente MoneyTrack seguía la filosofía "The Confident Ledger": SOLO la
 * confirmación manual creaba la transacción y movía saldo (ver `PRODUCT.md` y
 * `android-capture/README.md`). Por decisión consciente del usuario para reducir
 * trabajo manual, la app web ahora puede AUTO-CONFIRMAR en el cliente los
 * candidatos INEQUÍVOCOS, y deja en la bandeja de revisión solo los dudosos.
 *
 * Este módulo contiene únicamente la LÓGICA PURA (sin Firestore ni React): dado
 * un candidato pendiente + los instrumentos/cuentas/historial/reglas, decide si
 * el candidato califica para auto-confirmarse y con qué cuenta y categoría. El
 * commit atómico lo sigue haciendo `confirmTransactionImport` (motor existente):
 * aquí NO se reimplementa ni se afloja ninguna regla de Firestore.
 *
 * Criterio (deben cumplirse TODOS; si falla cualquiera → va a revisión; NUNCA se
 * asigna una categoría por defecto como 'Otros'):
 *  1. Datos válidos: monto entero > 0, comercio no vacío y fecha válida.
 *  2. Cuenta inequívoca: el instrumento del candidato matchea EXACTAMENTE un
 *     payment instrument registrado → una sola cuenta existente y no archivada.
 *  3. Categoría con confianza, en cascada: (a) historial del propio usuario con
 *     ese mismo comercio normalizado; (b) reglas de patrón claras; (c) si ninguna
 *     da categoría → a revisión.
 */

export type AutoConfirmReason =
  | 'datos-faltantes'
  | 'cuenta-sin-match'
  | 'cuenta-ambigua'
  | 'sin-categoria-confiable';

export type AutoConfirmResult =
  | {
    autoConfirm: true;
    accountId: string;
    category: string;
    instrumentId?: string;
  }
  | { autoConfirm: false; reason: AutoConfirmReason };

export interface EvaluateAutoConfirmInput {
  candidate: PendingTransactionImportCandidate;
  instruments: readonly PaymentInstrument[];
  accounts: readonly Account[];
  /** Categorías de gasto válidas del usuario (`categories.expense`). */
  expenseCategories: readonly string[];
  /**
   * Historial de categorías por comercio normalizado. Se calcula una sola vez con
   * `buildMerchantCategoryHistory` y se reutiliza para todos los candidatos.
   */
  history: MerchantCategoryHistory;
}

/** `Map<comercioNormalizado, Map<categoria, conteo>>`. */
export type MerchantCategoryHistory = Map<string, Map<string, number>>;

/**
 * Normaliza un nombre de comercio para emparejarlo de forma robusta: quita
 * acentos (NFD + strip de diacríticos), pasa a minúsculas es-CO y colapsa los
 * espacios. Mismo estilo que `normalizeBudgetCategory`/`normalizeText` del repo.
 */
export function normalizeMerchant(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-CO')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Reglas de patrón claras merchant→categoría. Cada entrada mapea una lista de
 * palabras clave (ya normalizadas) a una categoría EXACTA de
 * `DEFAULT_CATEGORIES.expense`. Solo cubren casos inequívocos; cualquier comercio
 * que no encaje queda sin categoría por regla (y entonces va a revisión salvo que
 * el historial resuelva).
 */
export const MERCHANT_PATTERN_RULES: ReadonlyArray<{
  keywords: readonly string[];
  category: string;
}> = [
  { keywords: ['uber', 'didi', 'cabify', 'beat'], category: 'Transporte' },
  {
    keywords: [
      'd1', 'ara', 'exito', 'olimpica', 'jumbo', 'carulla', 'makro',
      'justo & bueno', 'justo y bueno', 'supermercado', 'rappi', 'mcdonald',
      'restaurante', 'frisby', 'kfc', 'crepes', 'juan valdez', 'starbucks',
    ],
    category: 'Alimentación',
  },
  {
    keywords: ['comcel', 'claro', 'movistar', 'tigo', 'wom', 'epm', 'une'],
    category: 'Servicios',
  },
  { keywords: ['openai', 'platzi', 'udemy', 'coursera'], category: 'Educación' },
  {
    keywords: ['netflix', 'spotify', 'disney', 'hbo', 'max', 'youtube premium'],
    category: 'Entretenimiento',
  },
];

/**
 * Construye el historial de categorías por comercio a partir de las transacciones
 * del usuario. El motor de importación guarda el gasto con `description = merchant`,
 * así que emparejamos por `description` normalizada. Solo se cuentan gastos
 * (`type === 'expense'`) con categoría presente.
 */
export function buildMerchantCategoryHistory(
  transactions: readonly Transaction[],
): MerchantCategoryHistory {
  const history: MerchantCategoryHistory = new Map();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    const category = transaction.category?.trim();
    const description = transaction.description?.trim();
    if (!category || !description) continue;
    const key = normalizeMerchant(description);
    if (!key) continue;
    const counts = history.get(key) ?? new Map<string, number>();
    counts.set(category, (counts.get(category) ?? 0) + 1);
    history.set(key, counts);
  }
  return history;
}

/**
 * Devuelve la categoría MÁS frecuente del historial para ese comercio. Ante un
 * empate, resuelve de forma determinista por orden alfabético de la categoría
 * (para que la salida no dependa del orden de inserción de las transacciones).
 * Devuelve `null` si no hay historial para ese comercio.
 */
function resolveHistoryCategory(
  history: MerchantCategoryHistory,
  normalizedMerchant: string,
): string | null {
  const counts = history.get(normalizedMerchant);
  if (!counts || counts.size === 0) return null;
  let best: string | null = null;
  let bestCount = -1;
  for (const [category, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && category < best)) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}

/** Resuelve la categoría por reglas de patrón; `null` si ninguna aplica. */
function resolvePatternCategory(normalizedMerchant: string): string | null {
  for (const rule of MERCHANT_PATTERN_RULES) {
    if (rule.keywords.some(keyword => normalizedMerchant.includes(keyword))) {
      return rule.category;
    }
  }
  return null;
}

/**
 * Evalúa un candidato pendiente contra el criterio de auto-confirmación.
 * Devuelve `{autoConfirm:true, accountId, category}` solo si TODO el criterio se
 * cumple; en cualquier otro caso `{autoConfirm:false, reason}`.
 */
export function evaluateAutoConfirmCandidate(
  input: EvaluateAutoConfirmInput,
): AutoConfirmResult {
  const { candidate, instruments, accounts, expenseCategories, history } = input;

  // (1) Datos válidos: monto entero positivo, comercio no vacío y fecha válida.
  const merchant = candidate.merchant?.trim() ?? '';
  const hasValidAmount = Number.isInteger(candidate.amountMinor)
    && candidate.amountMinor > 0;
  const hasValidDate = candidate.occurredAt instanceof Date
    && Number.isFinite(candidate.occurredAt.getTime());
  if (!hasValidAmount || !merchant || !hasValidDate) {
    return { autoConfirm: false, reason: 'datos-faltantes' };
  }

  // (2) Cuenta inequívoca. Solo `android-notification` aporta evidencia de
  // instrumento; `android-shortcut` no trae `cardLast4`, así que el match es
  // 'none' y queda en revisión (no auto-confirmamos sugerencias del atajo).
  const match = candidate.source === 'android-notification'
    ? matchPaymentInstrument(
      {
        cardLast4: candidate.cardLast4,
        observedInstrumentLabel: candidate.observedInstrumentLabel,
      },
      instruments,
    )
    : ({ status: 'none' } as const);

  if (match.status === 'ambiguous') {
    return { autoConfirm: false, reason: 'cuenta-ambigua' };
  }
  if (match.status !== 'matched') {
    // 'none' o 'conflict': no hay una única cuenta clara.
    return { autoConfirm: false, reason: 'cuenta-sin-match' };
  }

  const account = accounts.find(current => current.id === match.accountId);
  if (!account || account.archived) {
    // La cuenta del instrumento no existe o está archivada → no es confiable.
    return { autoConfirm: false, reason: 'cuenta-sin-match' };
  }

  // (3) Categoría con confianza, en cascada: historial → reglas de patrón.
  const normalizedMerchant = normalizeMerchant(merchant);
  const category = resolveHistoryCategory(history, normalizedMerchant)
    ?? resolvePatternCategory(normalizedMerchant);

  // La categoría resuelta debe existir entre las categorías de gasto del usuario;
  // si no, no es confiable (p. ej. historial que apunta a una categoría borrada).
  if (!category || !expenseCategories.includes(category)) {
    return { autoConfirm: false, reason: 'sin-categoria-confiable' };
  }

  return {
    autoConfirm: true,
    accountId: match.accountId,
    category,
    instrumentId: match.instrumentId,
  };
}
