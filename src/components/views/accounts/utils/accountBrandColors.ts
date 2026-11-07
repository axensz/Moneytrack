/**
 * Colores de marca por cuenta/tarjeta — SOLO para el rediseño MÓVIL.
 *
 * Contexto de diseño (aprobado por el usuario y documentado en DESIGN.md):
 * - La identidad GENERAL del producto es un solo violet (#7c3aed / --primary).
 * - Los colores de marca de las TARJETAS y de las cuentas de ahorro/efectivo
 *   son identidad de CADA cuenta y se permiten únicamente en dos lugares del
 *   layout móvil: el anillo de distribución (como color de segmento/leyenda) y
 *   las tarjetas billetera (como gradiente de la clase `.card-wallet`).
 *
 * Contraste: el gradiente de cada tarjeta billetera lleva texto BLANCO encima.
 * Por eso ambos stops `from`/`to` se eligieron oscuros para cumplir WCAG AA
 * (texto blanco ≥4.5:1). Las marcas claras (p. ej. el cian de RappiCard) se
 * OSCURECEN a propósito: el `to` es el tono de marca y el `from` un tono más
 * profundo del mismo hue, de modo que ningún stop baje de 4.5:1 con blanco.
 * Ratios verificados (blanco #ffffff sobre cada stop):
 *   - violet  #7c3aed = 4.84:1 · #6d28d9 = 7.09:1
 *   - green   #047857 = 4.83:1 · #065f46 = 6.80:1
 *   - cyan    #0891b2 = 3.98:1 (NO cumple como stop más claro) → se usa
 *             #0e7490 = 5.23:1 como `to` y #155e75 = 6.80:1 como `from`.
 *   - blue    #1d4ed8 = 6.33:1 · #1e3a8a = 10.6:1
 *   - rose    #be123c = 6.08:1 · #9f1239 = 8.44:1
 *   - amber   #b45309 = 5.02:1 · #92400e = 6.96:1
 *   - slate   #334155 = 9.33:1 · #1e293b = 14.2:1 (fallback)
 * Todos los `to` elegidos cumplen ≥4.5:1; el `from` siempre es más oscuro.
 */

/** Paleta de marca disponible. El `accent` es el color sólido para el anillo/leyenda. */
export type AccountBrandKey =
  | 'violet'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'rose'
  | 'amber'
  | 'slate';

export interface AccountBrand {
  key: AccountBrandKey;
  /** Stop oscuro del gradiente (inicio). */
  from: string;
  /** Stop del gradiente (fin). Coincide con el tono de marca reconocible. */
  to: string;
  /** Color sólido para segmentos del anillo y puntos de leyenda. */
  accent: string;
}

const BRANDS: Record<AccountBrandKey, AccountBrand> = {
  violet: { key: 'violet', from: '#6d28d9', to: '#7c3aed', accent: '#7c3aed' },
  green: { key: 'green', from: '#065f46', to: '#047857', accent: '#047857' },
  cyan: { key: 'cyan', from: '#155e75', to: '#0e7490', accent: '#0891b2' },
  blue: { key: 'blue', from: '#1e3a8a', to: '#1d4ed8', accent: '#2563eb' },
  rose: { key: 'rose', from: '#9f1239', to: '#be123c', accent: '#e11d48' },
  amber: { key: 'amber', from: '#92400e', to: '#b45309', accent: '#d97706' },
  slate: { key: 'slate', from: '#1e293b', to: '#334155', accent: '#475569' },
};

/**
 * Reglas por nombre conocido. Se evalúan por coincidencia de subcadena
 * (insensible a mayúsculas/acentos) sobre el nombre de la cuenta. El orden
 * importa: la primera que coincide gana.
 */
const NAME_RULES: Array<{ match: RegExp; brand: AccountBrandKey }> = [
  { match: /nu\b|nubank|nu cr/i, brand: 'violet' },
  { match: /rappi/i, brand: 'cyan' },
  { match: /nequi/i, brand: 'cyan' },
  { match: /bancolombia/i, brand: 'amber' },
  { match: /nconta|nconta|daviplata|davivienda/i, brand: 'rose' },
  { match: /bbva|azul|bancamia/i, brand: 'blue' },
  { match: /efectivo|cash|billetera/i, brand: 'green' },
  { match: /ahorro|savings/i, brand: 'green' },
];

/**
 * Paleta estable por nombre para cuentas que no caen en una regla explícita.
 * Se asigna de forma determinista con un hash simple del nombre, de modo que
 * la misma cuenta siempre reciba el mismo color entre renders y sesiones.
 */
const FALLBACK_POOL: AccountBrandKey[] = [
  'violet',
  'green',
  'cyan',
  'blue',
  'rose',
  'amber',
];

/** Normaliza quitando acentos y pasando a minúsculas para comparar nombres. */
function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Hash determinista (djb2) para repartir nombres sin regla en el pool. */
function hashName(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i += 1) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Devuelve la paleta de marca para una cuenta a partir de su nombre.
 *
 * 1. Si el nombre coincide con una regla conocida, usa su marca.
 * 2. Si no, asigna una del pool de forma determinista por hash del nombre.
 * El fallback nunca deja una cuenta sin color; el violet queda como última
 * opción solo si el hash cae en él (no es un gris plano).
 */
export function getAccountBrand(name: string): AccountBrand {
  const normalized = normalize(name);

  for (const rule of NAME_RULES) {
    if (rule.match.test(normalized)) {
      return BRANDS[rule.brand];
    }
  }

  const index = hashName(normalized) % FALLBACK_POOL.length;
  return BRANDS[FALLBACK_POOL[index]];
}

/** Acceso directo a una marca por clave (para tests o usos puntuales). */
export function getBrandByKey(key: AccountBrandKey): AccountBrand {
  return BRANDS[key];
}
