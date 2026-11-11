import type { Account, Transaction } from '../types/finance';
import type {
  PaymentInstrument,
  PendingTransactionImportCandidate,
} from '../types/transactionImport';
import { matchPaymentInstrument } from './paymentInstrumentMatching';

/**
 * Auto-confirmación y enriquecimiento de candidatos de importación (capturas wallet/Android).
 *
 * DECISIÓN DE DISEÑO EXPLÍCITA DEL USUARIO (no es un bugfix):
 * Históricamente MoneyTrack seguía la filosofía "The Confident Ledger": SOLO la
 * confirmación manual creaba la transacción y movía saldo (ver `PRODUCT.md` y
 * `android-capture/README.md`). Por decisión consciente del usuario para reducir
 * trabajo manual, la app web ahora puede AUTO-CONFIRMAR en el cliente los
 * candidatos INEQUÍVOCOS, y deja en la bandeja de revisión solo los dudosos.
 *
 * Este módulo contiene únicamente la LÓGICA PURA (sin Firestore ni React): dado
 * un candidato pendiente + los instrumentos/cuentas/historial/reglas, analiza el
 * comercio para inferir categoría y cuenta, y decide si el candidato califica
 * para auto-confirmarse directamente. El commit atómico lo sigue haciendo
 * `confirmTransactionImport` (motor existente): aquí NO se reimplementa ni se
 * afloja ninguna regla de Firestore.
 *
 * Criterio (deben cumplirse TODOS; si falla cualquiera → va a revisión; NUNCA se
 * asigna una categoría por defecto como 'Otros'):
 *  1. Datos válidos: monto entero > 0, comercio no vacío y fecha válida.
 *  2. Cuenta inequívoca: sugerencia válida del atajo, match de payment instrument,
 *     nombre/marca única de cuenta activa o historial consistente del comercio.
 *  3. Categoría con confianza, en cascada: (a) sugerencia válida del atajo;
 *     (b) historial del propio usuario con ese comercio (exacto, sin prefijo de
 *     pasarela o por coincidencia parcial inequívoca); (c) reglas de patrón de
 *     comercios; (d) si ninguna da categoría → a revisión.
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
  /**
   * Historial opcional de cuentas por comercio normalizado, calculado con
   * `buildMerchantAccountHistory`.
   */
  accountHistory?: MerchantAccountHistory;
}

/** `Map<comercioNormalizado, Map<categoria, conteo>>`. */
export type MerchantCategoryHistory = Map<string, Map<string, number>>;

/** `Map<comercioNormalizado, Map<accountId, conteo>>`. */
export type MerchantAccountHistory = Map<string, Map<string, number>>;

export type ResolvedCandidateAccount =
  | {
    status: 'matched';
    accountId: string;
    instrumentId?: string;
    source: 'shortcut' | 'instrument' | 'account-label' | 'package' | 'history';
  }
  | { status: 'ambiguous' }
  | { status: 'none' };

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
 * Limpia prefijos habituales de pasarelas de pago, datáfonos y sufijos societarios
 * para que `"BOLD*JUAN VALDEZ 104"` o `"DL*RAPPI COLOMBIA SAS"` puedan emparejarse
 * contra el historial y las reglas de comercio.
 */
export function cleanMerchantForAnalysis(value: string): string {
  let cleaned = normalizeMerchant(value);
  if (!cleaned) return '';

  // Prefijos de pasarelas/agregadores frecuentes en notificaciones bancarias y Wallet
  cleaned = cleaned
    .replace(
      /^(?:bold|dlo?|payu|wompi|mercadopago|mp|stripe|sq|sumup|google|apple\.com\/bill)\s*[*·\-:]+\s*/i,
      '',
    )
    .replace(
      /^(?:compra\s+en|pago\s+en|pago\s+a|transferencia\s+a|compra\s+pos|compra)\s+/i,
      '',
    );

  // Sufijos societarios y códigos de sucursal/terminal al final
  cleaned = cleaned
    .replace(/(?:^|\s)(?:s\.?a\.?s\.?|s\.?a\.?|ltda\.?|inc\.?|llc\.?)(?=\s|$)/gi, ' ')
    .replace(/(?:\s+(?:suc(?:ursal)?|local|loc|terminal|term|pos)\s*#?\d+|\s+#\d+)$/i, '')
    .replace(/[*"']/g, ' ')
    .replace(/^[.,;:\-\s]+|[.,;:\-\s]+$/g, '')
    .trim()
    .replace(/\s+/g, ' ');

  return cleaned || normalizeMerchant(value);
}

/**
 * Reglas de patrón claras merchant→categoría. Cada entrada mapea una lista de
 * palabras clave (ya normalizadas) a una categoría de `DEFAULT_CATEGORIES.expense`.
 * Solo cubren casos inequívocos; cualquier comercio que no encaje queda sin
 * categoría por regla (y entonces va a revisión salvo que el historial resuelva).
 */
export const MERCHANT_PATTERN_RULES: ReadonlyArray<{
  keywords: readonly string[];
  category: string;
}> = [
  {
    keywords: [
      'uber eats', 'didi food', 'rappi', 'ifood',
      'd1', 'tiendas d1', 'ara', 'tiendas ara', 'exito', 'olimpica', 'jumbo',
      'carulla', 'makro', 'alkosto', 'surtimax', 'merqueo', 'euro supermercado',
      'justo & bueno', 'justo y bueno', 'supermercado', 'minimarket', 'fruver',
      'panaderia', 'pasteleria', 'reposteria', 'cafeteria', 'heladeria', 'popsy',
      'mcdonald', 'burger king', 'el corral', 'presto', 'restaurante', 'asadero',
      'pizzeria', 'sushi', 'frisby', 'kfc', 'crepes', 'wok', 'archies', 'subway',
      'domino', 'papa john', 'little caesars', 'kokoriko', 'ppc', 'juan valdez',
      'starbucks', 'tostao', 'oma', 'cosechas', 'dunkin',
    ],
    category: 'Alimentación',
  },
  {
    keywords: [
      'uber', 'didi', 'cabify', 'beat', 'indrive', 'picap', 'yango', 'taxi',
      'terpel', 'primax', 'biomax', 'texaco', 'esso', 'mobil', 'zeuss',
      'gasolina', 'estacion de servicio', 'flypass', 'gopass', 'peaje',
      'parqueadero', 'parking', 'metro de medellin', 'civica', 'transmilenio',
      'tullave', 'sitp', 'avianca', 'latam', 'wingo', 'jetsmart', 'copa airlines',
      'pinbus', 'redbus',
    ],
    category: 'Transporte',
  },
  {
    keywords: [
      'comcel', 'claro', 'movistar', 'tigo', 'wom', 'virgin mobile', 'etb',
      'epm', 'une', 'enel', 'codensa', 'vanti', 'acueducto', 'triple a',
      'air-e', 'afinia', 'gases de occidente', 'efigas', 'surtigas', 'emcali',
      'directv', 'aws', 'google cloud', 'icloud', 'google one', 'microsoft 365',
    ],
    category: 'Servicios',
  },
  {
    keywords: [
      'farmacia', 'drogueria', 'cruz verde', 'farmatodo', 'la rebaja', 'pasteur',
      'cafam', 'colsubsidio', 'locatel', 'bella piel', 'medipiel', 'sura',
      'sanitas', 'compensar', 'clinica', 'hospital', 'laboratorio', 'odontologia',
      'optica', 'smart fit', 'smartfit', 'bodytech', 'spinning center', 'action black',
    ],
    category: 'Salud',
  },
  {
    keywords: [
      'openai', 'chatgpt', 'anthropic', 'claude', 'cursor', 'platzi', 'udemy',
      'coursera', 'duolingo', 'edteam', 'domestika', 'universidad', 'colegio',
      'instituto', 'libreria nacional', 'panamericana',
    ],
    category: 'Educación',
  },
  {
    keywords: [
      'netflix', 'spotify', 'disney', 'hbo', 'max', 'prime video', 'amazon prime',
      'youtube premium', 'crunchyroll', 'paramount', 'apple tv', 'apple music',
      'deezer', 'playstation', 'xbox', 'nintendo', 'steam', 'epic games',
      'riot games', 'cine colombia', 'cinecolombia', 'cinemark', 'procinal',
      'royal films', 'cinepolis', 'tuboleta', 'eticket', 'taquillalive',
    ],
    category: 'Entretenimiento',
  },
  {
    keywords: [
      'homecenter', 'sodimac', 'easy', 'ikea', 'tugo', 'ferreteria',
      'arriendo', 'administracion', 'conjunto residencial',
    ],
    category: 'Vivienda',
  },
  {
    keywords: [
      'mercadolibre', 'mercado libre', 'amazon', 'aliexpress', 'temu', 'shein',
      'falabella', 'ktronix', 'alkomprar', 'ishop', 'mac center', 'zara',
      'bershka', 'stradivarius', 'pull & bear', 'h&m', 'arturo calle', 'gef',
      'punto blanco', 'baby fresh', 'mattelsa', 'koaj', 'offcorss', 'tennis',
      'studio f', 'velez', 'bosi', 'adidas', 'nike', 'puma', 'decathlon',
      'miniso', 'dollarcity',
    ],
    category: 'Compras Personales',
  },
  {
    keywords: [
      'floristeria', 'jugueteria', 'pepeganga',
    ],
    category: 'Regalos',
  },
];

const BANK_PACKAGE_KEYWORDS: ReadonlyArray<{
  packageToken: string;
  accountKeywords: readonly string[];
}> = [
  { packageToken: 'nequi', accountKeywords: ['nequi'] },
  { packageToken: 'daviplata', accountKeywords: ['daviplata'] },
  { packageToken: 'nu', accountKeywords: ['nu', 'nubank'] },
  { packageToken: 'bancolombia', accountKeywords: ['bancolombia'] },
  { packageToken: 'davivienda', accountKeywords: ['davivienda'] },
  { packageToken: 'bbva', accountKeywords: ['bbva'] },
  { packageToken: 'colpatria', accountKeywords: ['colpatria', 'scotiabank'] },
  { packageToken: 'scotiabank', accountKeywords: ['scotiabank', 'colpatria'] },
  { packageToken: 'avvillas', accountKeywords: ['av villas', 'avvillas'] },
  { packageToken: 'bogota', accountKeywords: ['banco de bogota', 'bogota'] },
  { packageToken: 'occidente', accountKeywords: ['occidente'] },
  { packageToken: 'popular', accountKeywords: ['popular'] },
  { packageToken: 'lulo', accountKeywords: ['lulo'] },
  { packageToken: 'rappi', accountKeywords: ['rappipay', 'rappi'] },
  { packageToken: 'uala', accountKeywords: ['uala'] },
  { packageToken: 'movii', accountKeywords: ['movii'] },
  { packageToken: 'dale', accountKeywords: ['dale'] },
];

function recordCount(
  map: Map<string, Map<string, number>>,
  key: string,
  value: string,
): void {
  if (!key || !value) return;
  const counts = map.get(key) ?? new Map<string, number>();
  counts.set(value, (counts.get(value) ?? 0) + 1);
  map.set(key, counts);
}

/**
 * Construye el historial de categorías por comercio a partir de las transacciones
 * del usuario. El motor de importación guarda el gasto con `description = merchant`,
 * así que emparejamos por `description` normalizada y por su versión limpia sin
 * prefijos de pasarela. Solo se cuentan gastos (`type === 'expense'`) con categoría.
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
    const normalized = normalizeMerchant(description);
    if (!normalized) continue;
    recordCount(history, normalized, category);
    const cleaned = cleanMerchantForAnalysis(description);
    if (cleaned && cleaned !== normalized) {
      recordCount(history, cleaned, category);
    }
  }
  return history;
}

/**
 * Construye el historial de cuentas usadas por comercio normalizado a partir de los
 * gastos previos del usuario (`type === 'expense'`).
 */
export function buildMerchantAccountHistory(
  transactions: readonly Transaction[],
): MerchantAccountHistory {
  const history: MerchantAccountHistory = new Map();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    const accountId = transaction.accountId?.trim();
    const description = transaction.description?.trim();
    if (!accountId || !description) continue;
    const normalized = normalizeMerchant(description);
    if (!normalized) continue;
    recordCount(history, normalized, accountId);
    const cleaned = cleanMerchantForAnalysis(description);
    if (cleaned && cleaned !== normalized) {
      recordCount(history, cleaned, accountId);
    }
  }
  return history;
}

function pickMostFrequentKey(counts: Map<string, number> | undefined): string | null {
  if (!counts || counts.size === 0) return null;
  let best: string | null = null;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && key < best)) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function containsWholePhrase(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  if (haystack === needle) return true;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\b|\\s)${escaped}(?:$|\\b|\\s)`).test(haystack);
}

/**
 * Devuelve la categoría MÁS frecuente del historial para ese comercio. Ante un
 * empate, resuelve de forma determinista por orden alfabético de la categoría.
 * Si no hay match exacto, intenta con el comercio limpio y luego por inclusión de
 * frase completa (>= 4 caracteres) sobre el historial.
 */
function resolveHistoryCategory(
  history: MerchantCategoryHistory,
  merchant: string,
): string | null {
  const normalized = normalizeMerchant(merchant);
  if (!normalized) return null;

  const exact = pickMostFrequentKey(history.get(normalized));
  if (exact) return exact;

  const cleaned = cleanMerchantForAnalysis(merchant);
  if (cleaned && cleaned !== normalized) {
    const cleanedMatch = pickMostFrequentKey(history.get(cleaned));
    if (cleanedMatch) return cleanedMatch;
  }

  const probe = cleaned || normalized;
  if (probe.length < 4) return null;

  const aggregated = new Map<string, number>();
  for (const [historyMerchant, counts] of history) {
    if (historyMerchant.length < 4) continue;
    if (
      containsWholePhrase(probe, historyMerchant)
      || containsWholePhrase(historyMerchant, probe)
    ) {
      for (const [category, count] of counts) {
        aggregated.set(category, (aggregated.get(category) ?? 0) + count);
      }
    }
  }
  return pickMostFrequentKey(aggregated);
}

/** Resuelve la categoría por reglas de patrón; `null` si ninguna aplica. */
function resolvePatternCategory(merchant: string): string | null {
  const normalized = normalizeMerchant(merchant);
  const cleaned = cleanMerchantForAnalysis(merchant);
  for (const rule of MERCHANT_PATTERN_RULES) {
    if (
      rule.keywords.some(keyword =>
        keyword.length <= 3
          ? containsWholePhrase(normalized, keyword) || containsWholePhrase(cleaned, keyword)
          : normalized.includes(keyword) || cleaned.includes(keyword),
      )
    ) {
      return rule.category;
    }
  }
  return null;
}

function matchUserExpenseCategory(
  candidateCategory: string | null | undefined,
  expenseCategories: readonly string[],
): string | null {
  if (!candidateCategory) return null;
  if (expenseCategories.includes(candidateCategory)) {
    return candidateCategory;
  }
  const normalizedTarget = normalizeMerchant(candidateCategory);
  if (!normalizedTarget) return null;
  return (
    expenseCategories.find(
      current => normalizeMerchant(current) === normalizedTarget,
    ) ?? null
  );
}

/**
 * Analiza el comercio (y sugerencia del atajo si existe) para inferir una categoría
 * válida dentro de `expenseCategories`.
 */
export function inferMerchantCategory(input: {
  merchant: string;
  expenseCategories: readonly string[];
  history?: MerchantCategoryHistory;
  suggestedCategory?: string;
}): string | null {
  const { merchant, expenseCategories, history, suggestedCategory } = input;
  const fromSuggestion = matchUserExpenseCategory(suggestedCategory, expenseCategories);
  if (fromSuggestion) return fromSuggestion;

  const trimmed = merchant?.trim() ?? '';
  if (!trimmed) return null;

  if (history) {
    const historyRaw = resolveHistoryCategory(history, trimmed);
    if (historyRaw) {
      return matchUserExpenseCategory(historyRaw, expenseCategories);
    }
  }

  const patternRaw = resolvePatternCategory(trimmed);
  return matchUserExpenseCategory(patternRaw, expenseCategories);
}

function resolveAccountFromHistory(
  accountHistory: MerchantAccountHistory | undefined,
  merchant: string,
  activeAccounts: readonly Account[],
): string | null {
  if (!accountHistory || accountHistory.size === 0) return null;
  const activeIds = new Set(activeAccounts.map(account => account.id));
  const filterActiveCounts = (counts: Map<string, number> | undefined) => {
    if (!counts) return undefined;
    const filtered = new Map<string, number>();
    for (const [accountId, count] of counts) {
      if (accountId && activeIds.has(accountId)) {
        filtered.set(accountId, count);
      }
    }
    return filtered;
  };

  const normalized = normalizeMerchant(merchant);
  const exact = pickMostFrequentKey(filterActiveCounts(accountHistory.get(normalized)));
  if (exact) return exact;

  const cleaned = cleanMerchantForAnalysis(merchant);
  if (cleaned && cleaned !== normalized) {
    const cleanedMatch = pickMostFrequentKey(filterActiveCounts(accountHistory.get(cleaned)));
    if (cleanedMatch) return cleanedMatch;
  }

  return null;
}

/**
 * Resuelve la cuenta más probable pero inequívoca para un candidato:
 * 1. Para `android-shortcut`: `suggestedAccountId` activa, o historial del comercio.
 * 2. Para `android-notification`:
 *    a) `matchPaymentInstrument` sobre instrumentos configurados.
 *    b) Coincidencia única de `cardLast4` o `observedInstrumentLabel` en el nombre
 *       de una cuenta activa (cuando no hay conflicto).
 *    c) Si la notificación no trae `cardLast4` desconocido, coincidencia única por
 *       paquete de la app bancaria (`sourcePackage`) o historial del comercio.
 */
export function resolveCandidateAccount(input: {
  candidate: PendingTransactionImportCandidate;
  instruments: readonly PaymentInstrument[];
  accounts: readonly Account[];
  accountHistory?: MerchantAccountHistory;
}): ResolvedCandidateAccount {
  const { candidate, instruments, accounts, accountHistory } = input;
  const activeAccounts = accounts.filter(
    (account): account is Account & { id: string } =>
      Boolean(account.id) && !account.archived,
  );

  if (candidate.source === 'android-shortcut') {
    const suggested = activeAccounts.find(
      account => account.id === candidate.suggestedAccountId,
    );
    if (suggested) {
      return {
        status: 'matched',
        accountId: suggested.id,
        source: 'shortcut',
      };
    }
    const historyAccountId = resolveAccountFromHistory(
      accountHistory,
      candidate.merchant,
      activeAccounts,
    );
    if (historyAccountId) {
      return {
        status: 'matched',
        accountId: historyAccountId,
        source: 'history',
      };
    }
    return { status: 'none' };
  }

  const match = matchPaymentInstrument(
    {
      cardLast4: candidate.cardLast4,
      observedInstrumentLabel: candidate.observedInstrumentLabel,
    },
    instruments,
  );

  if (match.status === 'ambiguous') {
    return { status: 'ambiguous' };
  }
  if (match.status === 'conflict') {
    return { status: 'none' };
  }
  if (match.status === 'matched') {
    const account = activeAccounts.find(current => current.id === match.accountId);
    if (!account) {
      return { status: 'none' };
    }
    return {
      status: 'matched',
      accountId: account.id,
      instrumentId: match.instrumentId,
      source: 'instrument',
    };
  }

  // Si trae últimos 4 dígitos pero ningún instrumento registrado coincidió, solo
  // aceptamos si exactamente una cuenta activa incluye esos 4 dígitos en su nombre.
  const cardLast4 = candidate.cardLast4?.trim();
  if (cardLast4) {
    const byLast4InName = activeAccounts.filter(account =>
      normalizeMerchant(account.name).includes(cardLast4),
    );
    if (byLast4InName.length === 1) {
      return {
        status: 'matched',
        accountId: byLast4InName[0].id,
        source: 'account-label',
      };
    }
    if (byLast4InName.length > 1) {
      return { status: 'ambiguous' };
    }
    return { status: 'none' };
  }

  // Sin `cardLast4`: intentar con `observedInstrumentLabel` contra nombres de cuentas activas.
  const observedLabel = normalizeMerchant(candidate.observedInstrumentLabel ?? '');
  if (observedLabel.length >= 3) {
    const byLabel = activeAccounts.filter(account => {
      const normalizedAccountName = normalizeMerchant(account.name);
      return (
        normalizedAccountName === observedLabel
        || containsWholePhrase(normalizedAccountName, observedLabel)
        || containsWholePhrase(observedLabel, normalizedAccountName)
      );
    });
    if (byLabel.length === 1) {
      return {
        status: 'matched',
        accountId: byLabel[0].id,
        source: 'account-label',
      };
    }
    if (byLabel.length > 1) {
      return { status: 'ambiguous' };
    }
  }

  // Intentar por paquete de la aplicación bancaria/billetera (`sourcePackage`).
  const normalizedPkg = (candidate.sourcePackage ?? '').toLowerCase();
  for (const rule of BANK_PACKAGE_KEYWORDS) {
    if (normalizedPkg.includes(rule.packageToken)) {
      const matchingAccounts = activeAccounts.filter(account => {
        const normalizedName = normalizeMerchant(account.name);
        return rule.accountKeywords.some(keyword =>
          containsWholePhrase(normalizedName, keyword) || normalizedName.includes(keyword),
        );
      });
      if (matchingAccounts.length === 1) {
        return {
          status: 'matched',
          accountId: matchingAccounts[0].id,
          source: 'package',
        };
      }
      if (matchingAccounts.length > 1) {
        return { status: 'ambiguous' };
      }
    }
  }

  // Por último, si no trajo evidencia de tarjeta desconocida (`!cardLast4` y
  // `!observedInstrumentLabel`), usar el historial de cuenta del comercio.
  if (!observedLabel) {
    const historyAccountId = resolveAccountFromHistory(
      accountHistory,
      candidate.merchant,
      activeAccounts,
    );
    if (historyAccountId) {
      return {
        status: 'matched',
        accountId: historyAccountId,
        source: 'history',
      };
    }
  }

  return { status: 'none' };
}

/**
 * Evalúa un candidato pendiente contra el criterio de auto-confirmación.
 * Devuelve `{autoConfirm:true, accountId, category}` solo si TODO el criterio se
 * cumple; en cualquier otro caso `{autoConfirm:false, reason}`.
 */
export function evaluateAutoConfirmCandidate(
  input: EvaluateAutoConfirmInput,
): AutoConfirmResult {
  const {
    candidate,
    instruments,
    accounts,
    expenseCategories,
    history,
    accountHistory,
  } = input;

  // (1) Datos válidos: monto entero positivo, comercio no vacío y fecha válida.
  const merchant = candidate.merchant?.trim() ?? '';
  const hasValidAmount = Number.isInteger(candidate.amountMinor)
    && candidate.amountMinor > 0;
  const hasValidDate = candidate.occurredAt instanceof Date
    && Number.isFinite(candidate.occurredAt.getTime());
  if (!hasValidAmount || !merchant || !hasValidDate) {
    return { autoConfirm: false, reason: 'datos-faltantes' };
  }

  // (2) Cuenta inequívoca.
  const accountMatch = resolveCandidateAccount({
    candidate,
    instruments,
    accounts,
    accountHistory,
  });

  if (accountMatch.status === 'ambiguous') {
    return { autoConfirm: false, reason: 'cuenta-ambigua' };
  }
  if (accountMatch.status !== 'matched') {
    return { autoConfirm: false, reason: 'cuenta-sin-match' };
  }

  // (3) Categoría con confianza: sugerencia válida del atajo → historial → reglas de patrón.
  const category = inferMerchantCategory({
    merchant,
    expenseCategories,
    history,
    suggestedCategory:
      candidate.source === 'android-shortcut'
        ? candidate.suggestedCategory
        : undefined,
  });

  if (!category) {
    return { autoConfirm: false, reason: 'sin-categoria-confiable' };
  }

  return {
    autoConfirm: true,
    accountId: accountMatch.accountId,
    category,
    ...(accountMatch.instrumentId
      ? { instrumentId: accountMatch.instrumentId }
      : {}),
  };
}
