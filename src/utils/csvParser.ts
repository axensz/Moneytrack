/**
 * Parser de extractos bancarios en formato CSV
 * Soporta formatos comunes de bancos colombianos:
 * Bancolombia, Davivienda, BBVA, Nequi, Scotiabank Colpatria, Banco de Bogotá
 */

import { CREDIT_PAYMENT_CATEGORY, DEFAULT_CATEGORIES } from '../config/constants';
import type { ImportProfile } from './importProfiles';
import { detectImportProfileFromText } from './importProfiles';

export type ParsedTransactionType = 'income' | 'expense' | 'transfer';

export type CategoryLookup = string[] | {
  expense?: string[];
  income?: string[];
};

export interface ParsedRow {
  date: Date;
  description: string;
  amount: number;
  type: ParsedTransactionType;
  suggestedCategory: string;
  categorySource?: 'file' | 'rules';
  rawLine: string;
  installments?: number;
  currentInstallment?: number;
  // Multimoneda (opcional)
  currency?: string;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  needsExchangeRate?: boolean; // moneda extranjera sin TRM → requiere acción del usuario
}

export interface ColumnMapping {
  date: number;
  description: number;
  debit: number | null;   // columna separada para débitos
  credit: number | null;  // columna separada para créditos
  amount: number | null;  // columna unificada de monto
  typeIndicator: number | null; // columna D/C o Tipo
  category: number | null;
  currency: number | null; // columna de moneda/divisa
  trm: number | null;      // columna de tasa de cambio (TRM)
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: string[];
  totalRows: number;
  skippedRows: number;
  profile?: ImportProfile;
}

// ── Detección de delimitador ─────────────────────────────────────────────────

function detectDelimiter(sample: string): string {
  const counts = {
    ';': (sample.match(/;/g) || []).length,
    ',': (sample.match(/,/g) || []).length,
    '\t': (sample.match(/\t/g) || []).length,
    '|': (sample.match(/\|/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// ── Parser de CSV respetando comillas ────────────────────────────────────────

function splitCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Detección de columnas por header ────────────────────────────────────────

const DATE_KEYWORDS = ['fecha', 'date', 'fecha mov', 'fec', 'fecha y hora', 'f.mov'];
const DESC_KEYWORDS = ['descripcion', 'descripción', 'concepto', 'detalle', 'referencia',
  'glosa', 'narración', 'narracion', 'movimiento', 'detail', 'concept'];
const DEBIT_KEYWORDS = ['debito', 'débito', 'cargo', 'retiro', 'egreso', 'debitos',
  'débitos', 'cargos', 'debit', 'salida', 'salidas'];
const CREDIT_KEYWORDS = ['credito', 'crédito', 'abono', 'ingreso', 'creditos',
  'créditos', 'abonos', 'credit', 'entrada', 'entradas'];
const AMOUNT_KEYWORDS = ['valor', 'monto', 'importe', 'amount', 'vlr', 'vr'];
const TYPE_KEYWORDS = ['d/c', 'tipo', 'type', 'db/cr', 'signo', 'clase'];
const CATEGORY_KEYWORDS = ['categoria', 'categoría', 'category', 'rubro', 'clasificacion'];
const CURRENCY_KEYWORDS = ['moneda', 'divisa', 'currency'];
const TRM_KEYWORDS = ['trm', 'tasa cambio', 'tasa de cambio', 'tasa representativa', 'exchange rate'];

function matchesKeyword(header: string, keywords: string[]): boolean {
  const h = header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return keywords.some(k => h.includes(k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
}

export function detectColumns(headers: string[]): ColumnMapping {
  let date = -1, description = -1, debit = -1, credit = -1, amount = -1, typeIndicator = -1, category = -1;
  let currency = -1, trm = -1;

  headers.forEach((h, i) => {
    // TRM y moneda se detectan aparte para no consumir el slot de otra columna.
    if (trm === -1 && matchesKeyword(h, TRM_KEYWORDS)) { trm = i; return; }
    if (currency === -1 && matchesKeyword(h, CURRENCY_KEYWORDS)) { currency = i; return; }

    if (date === -1 && matchesKeyword(h, DATE_KEYWORDS)) date = i;
    else if (description === -1 && matchesKeyword(h, DESC_KEYWORDS)) description = i;
    else if (debit === -1 && matchesKeyword(h, DEBIT_KEYWORDS)) debit = i;
    else if (credit === -1 && matchesKeyword(h, CREDIT_KEYWORDS)) credit = i;
    else if (amount === -1 && matchesKeyword(h, AMOUNT_KEYWORDS)) amount = i;
    else if (typeIndicator === -1 && matchesKeyword(h, TYPE_KEYWORDS)) typeIndicator = i;
    else if (category === -1 && matchesKeyword(h, CATEGORY_KEYWORDS)) category = i;
  });

  return {
    date: Math.max(date, 0),
    description: Math.max(description, date + 1 < headers.length ? date + 1 : 1),
    debit: debit >= 0 ? debit : null,
    credit: credit >= 0 ? credit : null,
    amount: amount >= 0 ? amount : null,
    typeIndicator: typeIndicator >= 0 ? typeIndicator : null,
    category: category >= 0 ? category : null,
    currency: currency >= 0 ? currency : null,
    trm: trm >= 0 ? trm : null,
  };
}

// ── Parser de montos (formato colombiano y estándar) ─────────────────────────

// Códigos de moneda que pueden aparecer pegados al monto en un extracto.
const CURRENCY_CODE_REGEX = /\b(COP|USD|EUR|MXN|CLP|ARS|PEN|BRL|GBP)\b/gi;

export function parseAmount(raw: string): number {
  if (raw == null) return 0;
  const original = String(raw).trim();
  if (original === '' || original === '-') return 0;

  // Negativo por signo o por paréntesis contables: (1.000) = -1000
  const isNegative = original.startsWith('-') || /^\(.*\)$/.test(original);

  // Quitar códigos de moneda (USD, COP…), símbolos ($ € £), espacios (incl. NBSP),
  // paréntesis y signos. Antes se usaba [$COP\s], que borraba las letras C/O/P
  // sueltas y dejaba "USD…" intacto → los montos en USD se parseaban como 0.
  let clean = original
    .replace(CURRENCY_CODE_REGEX, '')
    .replace(/[$€£\s ]/g, '')
    .replace(/[()]/g, '')
    .replace(/-/g, '');

  if (clean === '') return 0;

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) {
    // Formato colombiano con separador de miles: 1.234.567,89 → 1234567.89
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d{1,2}$/.test(clean)) {
    // Decimal con coma sin miles: 99,99 → 99.99 (antes daba 9999)
    clean = clean.replace(',', '.');
  } else {
    // Formato con coma como separador de miles: 1,234,567.89
    clean = clean.replace(/,/g, '');
  }

  const value = parseFloat(clean);
  if (isNaN(value)) return 0;
  return isNegative ? -value : value;
}

// ── Resolución de moneda / TRM ───────────────────────────────────────────────

// Códigos ISO de monedas extranjeras soportadas (COP se trata como local).
const FOREIGN_CURRENCY_CODES = new Set(['USD', 'EUR', 'GBP', 'MXN', 'CLP', 'ARS', 'PEN', 'BRL', 'CAD']);

/**
 * Normaliza un texto de moneda a su código ISO. Devuelve:
 * - 'COP' para pesos colombianos (o vacío/$).
 * - El código ISO ('USD', 'EUR'…) para monedas extranjeras conocidas.
 * - null si no se reconoce.
 */
export function normalizeCurrencyCode(raw: string): string | null {
  const value = norm(raw).replace(/[$\s.]/g, '').toUpperCase();
  if (!value || value === 'COP' || value === 'PESOS' || value === 'COL') return 'COP';
  if (value.startsWith('US') || value === 'DOLAR' || value === 'DOLARES' || value === 'DOLLAR') return 'USD';
  if (value.startsWith('EUR')) return 'EUR';
  return FOREIGN_CURRENCY_CODES.has(value) ? value : null;
}

export interface CurrencyResolution {
  amount: number;
  currency?: string;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  needsExchangeRate?: boolean;
}

/**
 * Convierte un monto en moneda extranjera a COP usando la TRM.
 * - COP (o sin moneda) → sin cambios.
 * - Moneda extranjera + TRM válida → amount en COP + metadatos originales.
 * - Moneda extranjera sin TRM → marca needsExchangeRate (no se puede convertir).
 */
export function resolveImportCurrency(amount: number, rawCurrency: string, rawTrm: string): CurrencyResolution {
  const code = normalizeCurrencyCode(rawCurrency);
  if (!code || code === 'COP') return { amount };

  const trm = parseAmount(rawTrm);
  if (trm > 0) {
    return {
      amount: Math.round(amount * trm),
      currency: 'COP',
      originalAmount: amount,
      originalCurrency: code,
      exchangeRate: trm,
    };
  }

  // Moneda extranjera sin TRM: no se puede convertir de forma segura.
  return {
    amount,
    originalAmount: amount,
    originalCurrency: code,
    needsExchangeRate: true,
  };
}

// ── Parser de fechas ─────────────────────────────────────────────────────────

// Meses textuales en español e inglés (3 primeras letras, sin tilde).
const TEXTUAL_MONTHS: Record<string, number> = {
  ene: 0, jan: 0,
  feb: 1,
  mar: 2,
  abr: 3, apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7, aug: 7,
  sep: 8, set: 8,
  oct: 9,
  nov: 10,
  dic: 11, dec: 11,
};

// Construye una fecha validando que no haya overflow silencioso de JS Date
// (ej: 32/13/2026 → Date la convierte en 2027-02-01). Devuelve null si la fecha
// resultante no coincide exactamente con los componentes solicitados.
function makeDate(year: number, month0: number, day: number): Date | null {
  if (month0 < 0 || month0 > 11 || day < 1 || day > 31) return null;
  const d = new Date(year, month0, day);
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() !== year || d.getMonth() !== month0 || d.getDate() !== day) return null;
  return d;
}

const DATE_FORMATS: Array<(s: string) => Date | null> = [
  // DD/MM/YYYY o DD-MM-YYYY
  (s) => {
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (!m) return null;
    return makeDate(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  },
  // YYYY-MM-DD (ISO)
  (s) => {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return makeDate(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  },
  // DD/MM/YY
  (s) => {
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
    if (!m) return null;
    const year = parseInt(m[3]) + (parseInt(m[3]) > 50 ? 1900 : 2000);
    return makeDate(year, parseInt(m[2]) - 1, parseInt(m[1]));
  },
  // YYYYMMDD
  (s) => {
    const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    return makeDate(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  },
  // DD mon YYYY → "04 may 2026", "27 MAY 2026", "4-may-2026" (Bancolombia/Nu)
  (s) => {
    const m = s.match(/^(\d{1,2})[\s\-/]+([A-Za-zÁÉÍÓÚáéíóúñ]{3,})\.?[\s\-/]+(\d{4})$/);
    if (!m) return null;
    const monthKey = norm(m[2]).slice(0, 3);
    const month = TEXTUAL_MONTHS[monthKey];
    if (month === undefined) return null;
    return makeDate(parseInt(m[3]), month, parseInt(m[1]));
  },
];

export function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  // Quitar la hora si viene pegada (ISO "T" o " HH:MM[:SS]"), conservando fechas
  // con mes textual como "27 MAY 2026" que NO deben cortarse en el primer espacio.
  const dateOnly = trimmed.replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?.*$/, '').trim();
  for (const fmt of DATE_FORMATS) {
    const d = fmt(dateOnly);
    if (d) return d;
  }
  return null;
}

// ── Auto-categorización por palabras clave en la descripción ─────────────────

// Prefijos de medios de pago que ocultan el comercio real.
// Ej: "PAGO PSE TIGO" → extraer "TIGO" para matchear Servicios
const PAYMENT_PREFIXES = [
  'compra en ', 'compra intl ', 'compra pos ',
  'pago pse ', 'pago llave ', 'pago qr ', 'pago suc virt ',
  'transf a ', 'transf qr ', 'transferencia a ',
  'recarga de ', 'pago de nomi ', 'pago nomi ',
  'cobro ', 'cargo ',
];

function extractMerchant(description: string): string {
  const lower = description.toLowerCase();
  for (const prefix of PAYMENT_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return description.slice(prefix.length).trim();
    }
  }
  return description;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const INTERNAL_TRANSFER_KEYWORDS = [
  'ABONO SUCURSAL VIRTUAL',
  'APLICACION SALDO A FAV',
  'TRASLADO SALDO A FAVOR',
  'Gracias por tu pago',
  'PAGO PSE NU',
  'PAGO TARJETA',
  'PAGO A TARJETA',
  'PAGO A TARJETA DE CREDITO',
  'PAGO TC',
  'PAGO CREDITO',
  'PAGO SUC VIRT TC',
  'TRANSFERENCIA PROPIA',
  'TRANSFERENCIA DESDE NEQUI',
  'TRANSFERENCIAS A NEQUI',
  'NEQUI ENVIO',
];

function uniqueCategories(categories?: CategoryLookup): string[] {
  const provided = Array.isArray(categories)
    ? categories
    : [
        ...(categories?.expense ?? []),
        ...(categories?.income ?? []),
      ];

  return [
    ...new Set([
      ...DEFAULT_CATEGORIES.expense,
      ...DEFAULT_CATEGORIES.income,
      CREDIT_PAYMENT_CATEGORY,
      ...provided,
    ]),
  ];
}

export function matchKnownCategory(raw: string, categories?: CategoryLookup): string | null {
  const value = raw.trim();
  if (!value) return null;

  const normalizedValue = norm(value);
  return uniqueCategories(categories).find(category => norm(category) === normalizedValue) ?? null;
}

export function isInternalTransferDescription(description: string): boolean {
  const value = norm(description);
  return INTERNAL_TRANSFER_KEYWORDS.some(keyword => value.includes(norm(keyword)));
}

export function inferImportType(description: string, parsedType: 'income' | 'expense'): ParsedTransactionType {
  return isInternalTransferDescription(description) ? 'transfer' : parsedType;
}

export function detectInstallments(description: string): { installments?: number; currentInstallment?: number } {
  const value = norm(description);
  const maxInstallments = 60;

  const cuotaDe = value.match(/\bcuota\s+(\d{1,2})\s+de\s+(\d{1,2})\b/);
  if (cuotaDe) {
    const currentInstallment = parseInt(cuotaDe[1], 10);
    const installments = parseInt(cuotaDe[2], 10);
    if (installments > 1 && installments <= maxInstallments && currentInstallment >= 1 && currentInstallment <= installments) {
      return { installments, currentInstallment };
    }
  }

  const fraction = value.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
  if (fraction) {
    const currentInstallment = parseInt(fraction[1], 10);
    const installments = parseInt(fraction[2], 10);
    if (installments > 1 && installments <= maxInstallments && currentInstallment >= 1 && currentInstallment <= installments) {
      return { installments, currentInstallment };
    }
  }

  const totalOnly = value.match(/\b(\d{1,2})\s+cuotas?\b/);
  if (totalOnly) {
    const installments = parseInt(totalOnly[1], 10);
    if (installments > 1 && installments <= maxInstallments) {
      return { installments };
    }
  }

  return {};
}

const CATEGORY_RULES: Array<{ keywords: string[]; category: string; type?: 'income' | 'expense' }> = [
  // ── INGRESOS ──────────────────────────────────────────────────────────────
  {
    keywords: [
      'nomina', 'nómina', 'sueldo', 'salario', 'pago empresa', 'pago empleador',
      'pago nomina', 'abono nomina', 'pago de nomi', 'pago nomi', 'pragma',
    ],
    category: 'Salario', type: 'income',
  },
  {
    keywords: [
      'freelance', 'honorarios', 'consulting', 'prestacion servicio',
      'cuenta cobro', 'factura cobro', 'pago honorarios',
      'pago de prov', 'pago proveedor', 'pexto',
    ],
    category: 'Freelance', type: 'income',
  },
  {
    keywords: [
      'dividendo', 'rendimiento', 'inversion', 'inversión', 'cdt', 'fiducuenta',
      'fondo inversion', 'tyba', 'a2censo', 'bold', 'nu bank', 'nequi ahorros',
      'abono interes', 'intereses ahorros', 'rendimiento cdt', 'ajuste interes',
    ],
    category: 'Inversiones', type: 'income',
  },
  {
    keywords: [
      'cesantia', 'cesantía', 'prima ', 'prima de', 'liquidacion', 'liquidación', 'vacaciones',
    ],
    category: 'Cesantías', type: 'income',
  },
  {
    keywords: ['desembolso', 'prestamo', 'préstamo', 'compra de cartera', 'credito aprobado'],
    category: 'Otros', type: 'income',
  },

  // ── TRANSPORTE ────────────────────────────────────────────────────────────
  {
    keywords: [
      // Apps
      'uber', 'cabify', 'indriver', 'didi', 'beat', 'picap', 'rappi moto',
      // Combustible
      'gasolina', 'terpel', 'primax', 'texaco', 'biomax', 'combustible', 'estacion servicio',
      // Parqueo
      'parqueadero', 'parking', 'apcoa', 'parque',
      // Transporte público
      'transmilenio', 'sitp', 'tarjeta civica', 'civica', 'metro de medellin', 'metro medellin',
      'mio', 'megabus', 'metrolinea', 'metroplús', 'metroplus', 'transcaribe', 'transmetro',
      'recarga civica', 'recarga tu llave',
      // Peajes
      'peaje', 'tunel', 'concesion vial',
      // Vehículo
      'soat', 'revision tecno', 'tecnomecanica', 'taller', 'mecanico', 'repuesto',
      'lubricante', 'lavadero', 'autolavado', 'lavautos',
      // Vuelos / bus
      'avianca', 'latam', 'wingo', 'jetsmart', 'flota', 'expreso', 'copetran',
      'bolivariano', 'terminal', 'aeropuerto', 'tiquete', 'tiquete aereo', 'tq',
    ],
    category: 'Transporte',
  },

  // ── ALIMENTACIÓN ─────────────────────────────────────────────────────────
  {
    keywords: [
      // Supermercados
      'exito', 'éxito', 'carulla', 'jumbo', 'alkosto', 'makro', 'pricesmart', 'costco',
      'd1', 'ara ', 'tienda ara', 'justo y bueno', 'justo bueno', 'surtimax', 'olimpica', 'olímpica',
      'supermercado', 'surtifruver', 'fruver', 'plaza mercado', 'galeria', 'minimercado',
      'mercacent', 'maxioferta', 'comida',
      // Comida rápida
      'mcdonalds', 'burger king', 'subway', 'kfc', 'frisby', 'el corral', 'crepes waffles',
      'crepes', 'wok', 'papa johns', 'dominos', 'pizza hut', 'presto', 'oma',
      'kokoriko', 'pollo olímpico', 'pollo olimpico', 'ajiaco', 'la brasa',
      'oxxo', 'sarku', 'dulce maria',
      // Cafeterías / café
      'juan valdez', 'starbucks', 'tostao', 'cafe', 'cafeteria', 'cafetería', 'cocorollo',
      'el laboratori', 'laboratorio cafe', 'pergamino', 'velvet', 'amor perfecto',
      // Domicilios
      'rappi', 'ifood', 'uber eats', 'didi food', 'pedidos ya', 'domicilio',
      // Restaurantes genéricos
      'restaurante', 'rest ', 'asadero', 'parrilla', 'sushi', 'pizza', 'empanada',
      // Panadería / tiendas
      'panaderia', 'panadería', 'cigarreria', 'cigarrería', 'tienda ', 'miscelanea',
      // Bebidas
      'cerveza', 'licoreria', 'licorera', 'vinos y licores',
    ],
    category: 'Alimentación',
  },

  // ── ENTRETENIMIENTO ──────────────────────────────────────────────────────
  {
    keywords: [
      // Streaming video
      'netflix', 'disney', 'hbo', 'max ', 'prime video', 'apple tv', 'paramount', 'star+',
      'crunchyroll', 'mubi', 'youtube premium',
      // Streaming música
      'spotify', 'deezer', 'apple music', 'tidal',
      // Gaming
      'steam', 'playstation', 'xbox', 'nintendo', 'epic games', 'twitch', 'riot games',
      'blizzard', 'ea games', 'ubisoft',
      // Google / Apple digital
      'google play', 'google one', 'google on', 'dlo*google', 'apple one', 'icloud',
      // Cines
      'cine', 'cinecolombia', 'cinemark', 'procinal', 'royal films', 'multiplex',
      // Salidas
      'bar ', 'discoteca', 'climax', 'concierto', 'teatro', 'museo', 'parque diversiones',
      'salitre magico', 'mundo aventura', 'maloka', 'acuapark', 'parque acuatico',
      // Deportes
      'gym', 'gimnasio', 'bodytech', 'spinning', 'crossfit', 'zumba',
    ],
    category: 'Entretenimiento',
  },

  // ── SERVICIOS (facturas, telefonía, utilities) ────────────────────────────
  {
    keywords: [
      // Energía
      'energia', 'energía', 'epm', 'codensa', 'enel', 'celsia', 'electricaribe', 'afinia',
      'chec', 'cens', 'essa', 'electrohuila',
      // Gas
      'gas natural', 'vanti', 'gases del caribe', 'surtigas', 'alcanos', 'llanogas',
      // Agua
      'acueducto', 'eaab', 'aguas de bogota', 'triple a', 'emcali', 'empas',
      // Telefonía / internet
      'claro', 'tigo', 'movistar', 'wom ', 'virgin mobile', 'etb', 'une ', 'edatel',
      'internet', 'telefonia', 'telefonía', 'fibra optica', 'plan datos',
      // TV
      'directv', 'dish ', 'une tv', 'claro tv', 'tigo une',
      // AI tools / suscripciones digitales
      'claude', 'openai', 'chatgpt', 'anthropic', 'amazon prime',
      'suscripcion', 'suscripción', 'subscription',
      // Servicios públicos
      'empresas publicas', 'empresas públicas',
      // Wompi — intermediario de pago usado por Tigo, servicios públicos, etc.
      'wompi',
      // Comisiones bancarias
      'comision', 'comisión', 'cuota manejo', 'cargo bancario', 'gravamen',
      'gmt ', '4x1000',
      // Seguros
      'seguros', 'seguro ', 'axa', 'liberty', 'mapfre', 'allianz', 'sura seguro',
      'proteccion ', 'vida group',
      // Pagos genéricos de servicios
      'pago servicio', 'recaudo', 'factura servicio',
    ],
    category: 'Servicios',
  },

  // ── VIVIENDA ─────────────────────────────────────────────────────────────
  {
    keywords: [
      'arriendo', 'arrendamiento', 'renta ', 'canon ', 'administracion', 'administración',
      'cuota copropiedad', 'inmobiliaria', 'predial', 'impuesto predial', 'valorizacion',
      'hipoteca', 'credito vivienda', 'leasing habitacional', 'conjunto residencial',
      'cuota admon', 'aseo urbano', 'aseo y recoleccion',
    ],
    category: 'Vivienda',
  },

  // ── SALUD ────────────────────────────────────────────────────────────────
  {
    keywords: [
      // EPS
      'eps', 'nueva eps', 'sura eps', 'sanitas', 'compensar eps', 'famisanar',
      'salud total', 'coomeva', 'medimas', 'aliansalud', 'coosalud',
      // Clínicas / hospitales
      'clinica', 'clínica', 'hospital', 'medico', 'médico', 'consultorio', 'ips ',
      // Farmacias
      'farmacia', 'drogueria', 'droguería', 'locatel', 'farmatodo', 'cruz verde',
      'la rebaja', 'rebaja plus', 'colsubsidio farmacia', 'medipiel', 'pasteur',
      // Diagnóstico (ir antes que Alimentación para "laboratorio")
      'laboratorio medico', 'laboratorio clinico', 'rayos x', 'ecografia',
      'resonancia', 'diagnostico', 'examen medico',
      // Especialistas
      'odontologia', 'odontología', 'optometria', 'optica', 'lentes ', 'ortodoncia',
      'psicologia', 'psiquiatria', 'fisioterapia',
      // Medicina prepagada
      'medicina prepagada', 'colmedica', 'colmédica', 'medicina integral',
      // Gimnasios / salud preventiva
      'smart fit', 'smartfit', 'profamilia',
    ],
    category: 'Salud',
  },

  // ── EDUCACIÓN ────────────────────────────────────────────────────────────
  {
    keywords: [
      // Colegios y universidades
      'colegio', 'universidad', 'uniandes', 'javeriana', 'nacional', 'icetex',
      'eafit', 'upb ', 'udea', 'udem', 'uninorte', 'unisabana', 'ean ', 'ceipa',
      'minuto de dios', 'uniminuto', 'politecnico', 'politécnico', 'sena ',
      // Matrículas
      'matricula', 'matrícula', 'pensión educativa', 'pension colegio', 'cuota educacion',
      // Cursos online
      'udemy', 'coursera', 'platzi', 'domestika', 'linkedin learning', 'skillshare',
      'duolingo', 'babbel', 'curso ', 'curso online',
      // Postgrados
      'diplomado', 'especializacion', 'especialización', 'maestria', 'maestría',
      // Librerías y útiles
      'libreria', 'librería', 'papeleria', 'papelería', 'panamericana', 'lerner',
      'utiles escolares', 'utiles',
      // Niquiadici (librería local del extracto)
      'niquiadici', 'buscalibre',
    ],
    category: 'Educación',
  },

  // ── FINANZAS (pagos de deuda, créditos) ──────────────────────────────────
  {
    keywords: [
      // Pagos de tarjeta / crédito
      'pago tc', 'pago tarjeta', 'pago credito', 'cuota credito', 'cuota prestamo',
      'pago suc virt tc', 'tc master', 'tc visa', 'amex', 'credibanco',
      // Entidades financieras
      'falabella credito', 'banco falabella', 'davivienda', 'bancolombia',
      'banco bogota', 'bbva', 'occidente', 'scotiabank', 'av villas', 'caja social',
      'nu compan', 'nu financ', 'nufin',
      'addi', 'sistecredito', 'cuota facil', 'alkosto credito',
      // Fondos / pensiones
      'porvenir', 'proteccion pensiones', 'colfondos', 'horizonte', 'skandia',
      'colpensiones',
    ],
    category: 'Otros',
  },

  // ── COMPRAS PERSONALES ───────────────────────────────────────────────────
  {
    keywords: [
      // Ropa / moda
      'zara', 'h&m', 'pull bear', 'bershka', 'stradivarius', 'mango', 'forever 21',
      'adidas', 'nike', 'puma', 'reebok', 'converse', 'vans',
      'arturo calle', 'studio f', 'ela ', 'tennis ', 'mario hernandez',
      // Hogar
      'homecenter', 'easy ', 'tugó', 'tugo', 'ikea', 'mueblemundo', 'jamar ',
      'colchones el dorado', 'muebles',
      // Tecnología
      'samsung', 'apple store', 'mac center', 'ishop', 'ktronix', 'alkomprar',
      'pc mac', 'tienda apple', 'fnac',
      // E-commerce / pasarelas de pago
      'amazon', 'mercado libre', 'mercado pago', 'mercadopago', 'pagseguro',
      'linio', 'shein', 'temu', 'aliexpress',
      // Ropa adicional
      'rifle',
      // Variedad
      'dollarcity', 'dollar city', 'miniso', 'daiso', 'flying tiger',
      'bazar', 'todo a', 'todo en artes', 'artesanias',
    ],
    category: 'Compras Personales',
  },

  // ── REGALOS ──────────────────────────────────────────────────────────────
  {
    keywords: [
      'regalo', 'cumpleaños', 'navidad', 'amor y amistad', 'dia madre', 'dia padre',
      'flores', 'floristeria', 'florería', 'tarjeta regalo',
    ],
    category: 'Regalos',
  },

  // ── FALLBACK: PATRONES BANCARIOS GENÉRICOS ───────────────────────────────
  { keywords: ['retiro atm', 'retiro cajero', 'avance cajero', 'retiro efectivo', 'retiro corresponsal'], category: 'Otros' },
  { keywords: ['transferencia', 'envio nequi', 'envío nequi', 'daviplata', 'transfiya', 'nequi'], category: 'Otros' },
];

export function suggestCategory(description: string, type: ParsedTransactionType): string {
  if (isInternalTransferDescription(description)) {
    return CREDIT_PAYMENT_CATEGORY;
  }

  // Intentar primero con el comercio real (quitando prefijo de medio de pago)
  // Ej: "PAGO PSE TIGO" → probar con "TIGO" antes que con la descripción completa
  const merchant = extractMerchant(description);
  const candidates = merchant !== description ? [merchant, description] : [description];

  for (const candidate of candidates) {
    const lower = norm(candidate);
    for (const rule of CATEGORY_RULES) {
      if (rule.type && rule.type !== type) continue;
      if (rule.keywords.some(k => lower.includes(norm(k)))) {
        return rule.category;
      }
    }
  }

  return type === 'income'
    ? DEFAULT_CATEGORIES.income[DEFAULT_CATEGORIES.income.length - 1]   // 'Otros'
    : DEFAULT_CATEGORIES.expense[DEFAULT_CATEGORIES.expense.length - 1]; // 'Otros'
}

// ── Función principal: parseCSV ───────────────────────────────────────────────

export function parseCSV(text: string, categories?: CategoryLookup): ParseResult {
  const errors: string[] = [];
  const rows: ParsedRow[] = [];
  const profile = detectImportProfileFromText(text, 'csv');

  // Normalizar saltos de línea y quitar BOM
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter(l => l.trim() !== '');

  if (lines.length < 2) {
    return { rows: [], errors: ['El archivo no contiene suficientes filas'], totalRows: 0, skippedRows: 0, profile };
  }

  const delimiter = detectDelimiter(lines.slice(0, 5).join('\n'));

  // Buscar la fila de headers (la primera que tenga texto reconocible)
  let headerIndex = 0;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cols = splitCSVLine(lines[i], delimiter);
    if (cols.some(c => matchesKeyword(c, [...DATE_KEYWORDS, ...DESC_KEYWORDS]))) {
      headerIndex = i;
      headers = cols;
      break;
    }
  }

  if (headers.length === 0) {
    headers = splitCSVLine(lines[0], delimiter);
    headerIndex = 0;
  }

  const mapping = detectColumns(headers);
  let skipped = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = splitCSVLine(line, delimiter);

    // Fecha
    const rawDate = cols[mapping.date] || '';
    const date = parseDate(rawDate);
    if (!date) {
      skipped++;
      continue;
    }

    // Descripción
    const description = (cols[mapping.description] || '').trim();
    if (!description) {
      skipped++;
      continue;
    }

    // Determinar tipo y monto
    let amount = 0;
    let type: 'income' | 'expense' = 'expense';

    if (mapping.debit !== null && mapping.credit !== null) {
      // Bancolombia style: columnas débito y crédito separadas
      const debitAmt = parseAmount(cols[mapping.debit] || '');
      const creditAmt = parseAmount(cols[mapping.credit] || '');
      if (creditAmt > 0) {
        amount = creditAmt;
        type = 'income';
      } else if (debitAmt > 0) {
        amount = debitAmt;
        type = 'expense';
      } else {
        skipped++;
        continue;
      }
    } else if (mapping.amount !== null) {
      // Columna unificada de monto
      const raw = cols[mapping.amount] || '';
      const parsed = parseAmount(raw);
      amount = Math.abs(parsed);

      if (mapping.typeIndicator !== null) {
        // D/C indicator column
        const indicator = (cols[mapping.typeIndicator] || '').trim().toUpperCase();
        type = indicator.startsWith('C') || indicator === 'ABONO' || indicator === 'INGRESO'
          ? 'income'
          : 'expense';
      } else {
        // Signo del monto: negativo = gasto, positivo = ingreso
        type = parsed < 0 ? 'expense' : 'income';
      }
    }

    if (amount <= 0) {
      skipped++;
      continue;
    }

    const detectedType = inferImportType(description, type);
    const fileCategory = mapping.category !== null
      ? matchKnownCategory(cols[mapping.category] || '', categories)
      : null;
    const installmentsInfo = detectInstallments(description);
    const currencyInfo = resolveImportCurrency(
      amount,
      mapping.currency !== null ? (cols[mapping.currency] || '') : '',
      mapping.trm !== null ? (cols[mapping.trm] || '') : ''
    );

    rows.push({
      date,
      description,
      type: detectedType,
      suggestedCategory: fileCategory ?? suggestCategory(description, detectedType),
      categorySource: fileCategory ? 'file' : 'rules',
      rawLine: line,
      ...installmentsInfo,
      ...currencyInfo, // incluye amount (convertido a COP si había TRM)
    });
  }

  return {
    rows,
    errors,
    totalRows: lines.length - headerIndex - 1,
    skippedRows: skipped,
    profile,
  };
}
