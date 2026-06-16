export interface ImportLearningRule {
  pattern: string;
  category: string;
  sourceDescription: string;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
}

export interface ImportLearningCandidate {
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
}

export interface ImportLearningGroup<T extends ImportLearningCandidate = ImportLearningCandidate> {
  pattern: string;
  indexes: number[];
  sample: T;
}

const PAYMENT_PREFIXES = [
  'compra en',
  'compra intl',
  'compra pos',
  'pago pse',
  'pago qr',
  'pago suc virt',
  'transf a',
  'transferencia a',
  'recarga de',
  'cargo',
  'cobro',
];

const GENERIC_TOKENS = new Set([
  'abono',
  'cargo',
  'compra',
  'credito',
  'debito',
  'desde',
  'detalle',
  'movimiento',
  'pago',
  'pos',
  'pse',
  'qr',
  'recaudo',
  'suc',
  'tarjeta',
  'tc',
  'transf',
  'transferencia',
  'virt',
  'virtual',
]);

export function normalizeImportText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractLearningPattern(description: string): string {
  let normalized = normalizeImportText(description);
  const prefix = PAYMENT_PREFIXES.find(item => normalized.startsWith(item));
  if (prefix) {
    normalized = normalized.slice(prefix.length).trim();
  }

  const tokens = normalized
    .split(' ')
    .filter(token => token.length >= 3 && !GENERIC_TOKENS.has(token) && !/^\d+$/.test(token));

  if (tokens[0] === 'smart' && tokens[1] === 'fit') return 'smart fit';
  return tokens[0] ?? normalized.slice(0, 30);
}

/**
 * ¿El patrón aparece como PALABRA completa en la descripción? Antes se usaba
 * `includes` (substring), así que un patrón corto aprendido de una sola
 * categorización ("col", "ave") matcheaba descripciones no relacionadas
 * ("colombia", "favela") y envenenaba imports futuros. El límite por palabra
 * evita ese falso positivo y conserva los patrones multi-palabra ("smart fit").
 */
function patternMatchesAsWord(normalizedDescription: string, pattern: string): boolean {
  const pat = normalizeImportText(pattern);
  if (!pat) return false;
  const escaped = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(normalizedDescription);
}

export function findLearnedCategory(
  description: string,
  rules: ImportLearningRule[],
  validCategories: string[] = []
): string | null {
  const normalizedDescription = normalizeImportText(description);
  const validSet = validCategories.length > 0
    ? new Set(validCategories.map(normalizeImportText))
    : null;

  const match = [...rules]
    .sort((a, b) => b.pattern.length - a.pattern.length)
    .find(rule => {
      if (validSet && !validSet.has(normalizeImportText(rule.category))) return false;
      return patternMatchesAsWord(normalizedDescription, rule.pattern);
    });

  return match?.category ?? null;
}

export function groupImportRowsByPattern<T extends ImportLearningCandidate>(
  items: Array<{ row: T; index: number }>
): ImportLearningGroup<T>[] {
  const grouped = new Map<string, ImportLearningGroup<T>>();

  items.forEach(({ row, index }) => {
    const pattern = extractLearningPattern(row.description) || row.description;
    const group = grouped.get(pattern);
    if (group) {
      group.indexes.push(index);
    } else {
      grouped.set(pattern, { pattern, indexes: [index], sample: row });
    }
  });

  return [...grouped.values()];
}

export function upsertImportLearningRule(
  rules: ImportLearningRule[],
  description: string,
  category: string,
  now = new Date()
): ImportLearningRule[] {
  const pattern = extractLearningPattern(description);
  if (!pattern || !category.trim()) return rules;

  const timestamp = now.toISOString();
  const index = rules.findIndex(rule => normalizeImportText(rule.pattern) === normalizeImportText(pattern));

  if (index === -1) {
    return [
      ...rules,
      {
        pattern,
        category,
        sourceDescription: description,
        createdAt: timestamp,
        lastUsedAt: timestamp,
        useCount: 1,
      },
    ];
  }

  return rules.map((rule, ruleIndex) => ruleIndex === index
    ? {
        ...rule,
        category,
        sourceDescription: description,
        lastUsedAt: timestamp,
        useCount: rule.useCount + 1,
      }
    : rule
  );
}
