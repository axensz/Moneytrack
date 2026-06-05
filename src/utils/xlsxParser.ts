/**
 * Parser de extractos bancarios en formato Excel (.xlsx)
 * Soporta el formato de extractos de Bancolombia (Cuenta de Ahorros / Corriente)
 * con detección automática de metadatos, desbordamiento de columnas y año inferido.
 *
 * También incluye un parser tabular genérico para extractos detallados de tarjetas
 * Bancolombia Visa/Mastercard, cuyos movimientos suelen venir con encabezados
 * completos (fecha, descripción/comercio y valor) en lugar de fechas D/MM en la
 * primera columna.
 */

import * as XLSX from 'xlsx';
import type { CategoryLookup, ParseResult, ParsedRow } from './csvParser';
import type { ImportProfile } from './importProfiles';
import {
  detectInstallments,
  inferImportType,
  matchKnownCategory,
  parseDate,
  resolveImportCurrency,
  suggestCategory,
} from './csvParser';
import { detectImportProfileFromSheetData } from './importProfiles';

// Fecha en formato D/MM o DD/MM (sin año)
const DATE_REGEX = /^\d{1,2}\/\d{2}$/;

// Palabras que identifican filas de metadatos a ignorar
const SKIP_KEYWORDS = [
  'informaci', 'cliente', 'direcci', 'ciudad', 'desde', 'hasta',
  'tipo cuenta', 'nro cuenta', 'resumen', 'saldo anterior', 'total abonos',
  'total cargos', 'saldo actual', 'saldo promedio', 'cupo', 'intereses',
  'retefuente', 'fecha', 'descripci', 'dcto', 'valor', 'saldo',
  'movimientos', 'fin estado', 'sucursal',
];

const DATE_HEADER_KEYWORDS = ['fecha', 'date', 'f.mov', 'f. mov'];
const DESCRIPTION_HEADER_KEYWORDS = [
  'descripcion', 'descripción', 'detalle', 'concepto', 'referencia',
  'establecimiento', 'comercio', 'movimiento', 'operacion', 'operación',
];
const DEBIT_HEADER_KEYWORDS = [
  'debito', 'débito', 'cargo', 'cargos', 'consumo', 'compra', 'compras',
  'retiro', 'egreso', 'utilizacion', 'utilización',
];
const CREDIT_HEADER_KEYWORDS = [
  'credito', 'crédito', 'abono', 'abonos', 'pago', 'pagos', 'reintegro',
  'devolucion', 'devolución',
];
const AMOUNT_HEADER_KEYWORDS = [
  'valor', 'monto', 'importe', 'amount', 'vlr', 'vr', 'pesos', 'cop',
  'colombianos', 'total',
];
const TYPE_HEADER_KEYWORDS = ['d/c', 'tipo', 'naturaleza', 'signo', 'clase', 'db/cr'];
const CATEGORY_HEADER_KEYWORDS = ['categoria', 'categoría', 'category', 'rubro'];
const CURRENCY_HEADER_KEYWORDS = ['moneda', 'divisa', 'currency'];
const TRM_HEADER_KEYWORDS = ['trm', 'tasa cambio', 'tasa de cambio', 'tasa representativa', 'exchange rate'];
const BALANCE_HEADER_KEYWORDS = ['saldo', 'balance', 'cupo'];
const INSTALLMENT_HEADER_KEYWORDS = ['cuota', 'cuotas', 'plazo'];
const CARD_STATEMENT_KEYWORDS = [
  'mastercard', 'visa', 'american express', 'tarjeta de credito',
  'tarjeta de crédito', 'pago minimo', 'pago mínimo', 'fecha de corte',
  'cupo disponible', 'extracto detallado',
];
const PAYMENT_DESCRIPTION_KEYWORDS = [
  'pago', 'abono', 'reintegro', 'devolucion', 'devolución', 'reversion',
  'reversión', 'ajuste credito', 'ajuste crédito',
];

interface GenericColumnMapping {
  date: number;
  description: number;
  debit: number | null;
  credit: number | null;
  amount: number | null;
  typeIndicator: number | null;
  category: number | null;
  currency: number | null;
  trm: number | null;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function includesAny(value: string, keywords: string[]): boolean {
  const normalized = normalize(value);
  return keywords.some(keyword => normalized.includes(normalize(keyword)));
}

function isMetadataRow(cols: unknown[]): boolean {
  const first = normalize(String(cols[0] ?? '').trim());
  if (!first) return true;
  return SKIP_KEYWORDS.some(k => first.startsWith(k) || first === normalize(k));
}

function parseColombianAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;

  // SheetJS a veces devuelve el número ya parseado
  if (typeof raw === 'number') return raw;

  const str = String(raw).trim();
  if (!str || str === 'nan' || str === '#N/A' || str === '-') return null;

  // Quitar símbolos/moneda y conservar solo caracteres numéricos relevantes
  let cleaned = str
    .replace(/\(([^)]+)\)/, '-$1')
    .replace(/cop/gi, '')
    .replace(/[$\s]/g, '');

  // Añadir cero inicial si empieza con punto: ".60" → "0.60"
  cleaned = cleaned.replace(/^(-?)\./, '$10.');

  // Detectar formato colombiano (punto como miles, coma como decimal)
  let normalizedAmount: string;
  if (/\d\.\d{3}/.test(cleaned)) {
    normalizedAmount = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalizedAmount = cleaned.replace(/,/g, '');
  }

  const num = parseFloat(normalizedAmount);
  return isNaN(num) ? null : num;
}

function inferYear(month: number, hastaYear: number, hastaMonth: number): number {
  // Si el mes de la transacción es posterior al mes final del extracto → año anterior
  return month > hastaMonth ? hastaYear - 1 : hastaYear;
}

function parseTransactionDate(raw: string, hastaYear: number, hastaMonth: number): Date | null {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{2})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const year = inferYear(month, hastaYear, hastaMonth);
  const d = new Date(year, month - 1, day);
  return isNaN(d.getTime()) ? null : d;
}

function extractHastaDate(data: unknown[][]): { year: number; month: number } {
  const now = new Date();
  const fallback = { year: now.getFullYear(), month: now.getMonth() + 1 };

  for (let i = 0; i < data.length - 1; i++) {
    const cell0 = normalize(String(data[i][0] ?? '').trim());
    // La fila de headers "DESDE | HASTA | ..." precede a la fila de valores
    if (cell0 === 'desde') {
      const valueRow = data[i + 1];
      // HASTA está en col 1
      const hastaRaw = String(valueRow?.[1] ?? '').trim();
      // Formato esperado: YYYY/MM/DD o YYYY-MM-DD
      const m = hastaRaw.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
      if (m) return { year: parseInt(m[1]), month: parseInt(m[2]) };
    }
  }
  return fallback;
}

function excelDateToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 100000) return null;
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) return null;
  const date = new Date(parsed.y, parsed.m - 1, parsed.d);
  return isNaN(date.getTime()) ? null : date;
}

function parseGenericDate(raw: unknown): Date | null {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') return excelDateToDate(raw);
  const text = String(raw ?? '').trim();
  if (!text) return null;
  return parseDate(text.replace(/\//g, '-')) ?? parseDate(text);
}

function rowText(row: unknown[]): string {
  return row.map(cell => String(cell ?? '')).join(' ');
}

function isLikelyCardStatement(data: unknown[][]): boolean {
  const sample = data.slice(0, 30).map(rowText).join(' ');
  return includesAny(sample, CARD_STATEMENT_KEYWORDS);
}

function findGenericHeader(data: unknown[][]): { index: number; mapping: GenericColumnMapping } | null {
  for (let index = 0; index < Math.min(data.length, 80); index++) {
    const headers = data[index].map(cell => String(cell ?? '').trim());
    const mapping = detectGenericColumns(headers);
    if (mapping.date >= 0 && mapping.description >= 0 && (mapping.amount !== null || mapping.debit !== null || mapping.credit !== null)) {
      return { index, mapping };
    }
  }
  return null;
}

function detectGenericColumns(headers: string[]): GenericColumnMapping {
  let date = -1;
  let description = -1;
  let debit: number | null = null;
  let credit: number | null = null;
  let amount: number | null = null;
  let typeIndicator: number | null = null;
  let category: number | null = null;
  let currency: number | null = null;
  let trm: number | null = null;

  headers.forEach((header, index) => {
    if (!header) return;
    const isBalanceColumn = includesAny(header, BALANCE_HEADER_KEYWORDS);
    const isInstallmentColumn = includesAny(header, INSTALLMENT_HEADER_KEYWORDS) && !includesAny(header, AMOUNT_HEADER_KEYWORDS);

    // TRM y moneda primero, para que no consuman el slot de "valor".
    if (trm === null && includesAny(header, TRM_HEADER_KEYWORDS)) { trm = index; return; }
    if (currency === null && includesAny(header, CURRENCY_HEADER_KEYWORDS)) { currency = index; return; }

    if (date === -1 && includesAny(header, DATE_HEADER_KEYWORDS)) date = index;
    if (description === -1 && includesAny(header, DESCRIPTION_HEADER_KEYWORDS)) description = index;
    if (typeIndicator === null && includesAny(header, TYPE_HEADER_KEYWORDS)) typeIndicator = index;
    if (category === null && includesAny(header, CATEGORY_HEADER_KEYWORDS)) category = index;

    if (!isBalanceColumn && !isInstallmentColumn) {
      if (debit === null && includesAny(header, DEBIT_HEADER_KEYWORDS)) debit = index;
      if (credit === null && includesAny(header, CREDIT_HEADER_KEYWORDS)) credit = index;
      if (amount === null && includesAny(header, AMOUNT_HEADER_KEYWORDS)) amount = index;
    }
  });

  // Evitar usar la misma columna dos veces cuando el encabezado genérico contiene
  // palabras como "valor compra"; en ese caso es una columna única de monto.
  if (amount !== null && amount === debit) debit = null;
  if (amount !== null && amount === credit) credit = null;

  return { date, description, debit, credit, amount, typeIndicator, category, currency, trm };
}

function parseDescription(row: unknown[], descriptionIndex: number): string {
  const parts = [row[descriptionIndex], row[descriptionIndex + 1]]
    .map(value => String(value ?? '').trim())
    .filter(Boolean);

  // Algunos extractos dividen el comercio/ciudad en la columna siguiente. Solo
  // concatenamos si esa columna no parece monto ni fecha.
  if (parts.length > 1) {
    const nextAmount = parseColombianAmount(row[descriptionIndex + 1]);
    const nextDate = parseGenericDate(row[descriptionIndex + 1]);
    if (nextAmount !== null || nextDate) return parts[0];
  }

  return parts.join(' ').trim();
}

function typeFromIndicator(raw: unknown): 'income' | 'expense' | null {
  const value = normalize(String(raw ?? '').trim());
  if (!value) return null;
  if (['c', 'cr', 'credito', 'abono', 'ingreso'].some(token => value === token || value.includes(token))) return 'income';
  if (['d', 'db', 'debito', 'cargo', 'egreso', 'compra'].some(token => value === token || value.includes(token))) return 'expense';
  return null;
}

function isPaymentLike(description: string): boolean {
  return includesAny(description, PAYMENT_DESCRIPTION_KEYWORDS);
}

function parseGenericXLSXRows(data: unknown[][], categories?: CategoryLookup, profile?: ImportProfile): ParseResult | null {
  const header = findGenericHeader(data);
  if (!header) return null;

  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  let totalRows = 0;
  let skippedRows = 0;
  const isCardStatement = isLikelyCardStatement(data);
  const amountHeader = header.mapping.amount !== null
    ? String(data[header.index][header.mapping.amount] ?? '')
    : '';

  for (const row of data.slice(header.index + 1)) {
    const date = parseGenericDate(row[header.mapping.date]);
    if (!date) continue;

    totalRows++;
    const description = parseDescription(row, header.mapping.description);
    if (!description || isMetadataRow([description])) {
      skippedRows++;
      continue;
    }

    const debitAmount = header.mapping.debit !== null ? parseColombianAmount(row[header.mapping.debit]) : null;
    const creditAmount = header.mapping.credit !== null ? parseColombianAmount(row[header.mapping.credit]) : null;
    const unifiedAmount = header.mapping.amount !== null ? parseColombianAmount(row[header.mapping.amount]) : null;

    let amount: number | null = null;
    let type: 'income' | 'expense' | null = null;

    if (debitAmount !== null && Math.abs(debitAmount) > 0) {
      amount = debitAmount;
      type = 'expense';
    } else if (creditAmount !== null && Math.abs(creditAmount) > 0) {
      amount = creditAmount;
      type = 'income';
    } else if (unifiedAmount !== null && Math.abs(unifiedAmount) > 0) {
      amount = unifiedAmount;
      type = header.mapping.typeIndicator !== null ? typeFromIndicator(row[header.mapping.typeIndicator]) : null;

      if (!type) {
        if (amount < 0) {
          type = isCardStatement ? 'income' : 'expense';
        } else if (isCardStatement) {
          type = includesAny(amountHeader, CREDIT_HEADER_KEYWORDS) || isPaymentLike(description) ? 'income' : 'expense';
        } else {
          type = 'income';
        }
      }
    }

    if (amount === null || amount === 0 || !type) {
      skippedRows++;
      continue;
    }

    const detectedType = inferImportType(description, type);
    const fileCategory = header.mapping.category !== null
      ? matchKnownCategory(String(row[header.mapping.category] ?? ''), categories)
      : null;
    const installmentsInfo = detectInstallments(description);
    const currencyInfo = resolveImportCurrency(
      Math.abs(amount),
      header.mapping.currency !== null ? String(row[header.mapping.currency] ?? '') : '',
      header.mapping.trm !== null ? String(row[header.mapping.trm] ?? '') : ''
    );

    rows.push({
      date,
      description,
      type: detectedType,
      suggestedCategory: fileCategory ?? suggestCategory(description, detectedType),
      categorySource: fileCategory ? 'file' : 'rules',
      rawLine: row.map(cell => cell ?? '').join('|'),
      ...installmentsInfo,
      ...currencyInfo, // incluye amount (convertido a COP si había TRM)
    });
  }

  if (rows.length === 0) {
    errors.push(
      totalRows > 0
        ? `Se encontraron ${totalRows} filas con fecha pero no pudieron parsearse. Verifica las columnas de descripción y valor.`
        : 'No se encontraron movimientos debajo del encabezado del extracto.'
    );
  }

  return { rows, errors, totalRows, skippedRows, profile };
}

function parseBancolombiaAccountRows(data: unknown[][], profile?: ImportProfile): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  let skippedRows = 0;
  let totalRows = 0;

  // Inferir año desde metadatos del extracto
  const { year: hastaYear, month: hastaMonth } = extractHastaDate(data);

  for (const row of data) {
    const col0 = String(row[0] ?? '').trim();

    // Solo procesar filas cuya primera columna sea una fecha D/MM o DD/MM
    if (!DATE_REGEX.test(col0)) continue;

    // Doble chequeo: ignorar si parece metadato
    if (isMetadataRow(row)) continue;

    totalRows++;

    const date = parseTransactionDate(col0, hastaYear, hastaMonth);
    if (!date) {
      skippedRows++;
      continue;
    }

    // ── Detección de desbordamiento de columna ────────────────────────────────
    // Normal:    col[1]=descripción, col[2]=null, col[3]=null, col[4]=monto, col[5]=saldo
    // Overflow:  col[1]=desc_pt1,    col[2]=desc_pt2, col[3]=null, col[4]=null, col[5]=monto
    const col1 = String(row[1] ?? '').trim();
    const col2 = String(row[2] ?? '').trim();
    const col4Raw = row[4];
    const col5Raw = row[5];

    const col4Empty =
      col4Raw === null || col4Raw === undefined || String(col4Raw).trim() === '';

    let description: string;
    let amountRaw: unknown;

    if (col4Empty && col2) {
      // Descripción desbordada a col[2], monto desplazado a col[5]
      description = `${col1}${col2}`.trim();
      amountRaw = col5Raw;
    } else {
      description = col1;
      amountRaw = col4Raw;
    }

    if (!description) {
      skippedRows++;
      continue;
    }

    const amount = parseColombianAmount(amountRaw);
    if (amount === null || amount === 0) {
      skippedRows++;
      continue;
    }

    // Negativo = cargo (gasto), positivo = abono (ingreso)
    const type: 'income' | 'expense' = amount < 0 ? 'expense' : 'income';
    const absAmount = Math.abs(amount);

    const detectedType = inferImportType(description, type);
    const installmentsInfo = detectInstallments(description);

    rows.push({
      date,
      description,
      amount: absAmount,
      type: detectedType,
      suggestedCategory: suggestCategory(description, detectedType),
      categorySource: 'rules',
      rawLine: (row as unknown[]).map(c => c ?? '').join('|'),
      ...installmentsInfo,
    });
  }

  if (rows.length === 0) {
    if (totalRows > 0) {
      errors.push(
        `Se encontraron ${totalRows} filas con fecha pero no pudieron parsearse. Verifica el formato del archivo.`
      );
    } else {
      errors.push(
        'No se encontraron transacciones. Asegúrate de que sea un extracto bancario o de tarjeta Bancolombia en formato Excel.'
      );
    }
  }

  return { rows, errors, totalRows, skippedRows, profile };
}

export function parseXLSX(buffer: ArrayBuffer, categories?: CategoryLookup): ParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  } catch {
    return {
      rows: [],
      errors: ['No se pudo leer el archivo Excel. Verifica que no esté dañado.'],
      totalRows: 0,
      skippedRows: 0,
    };
  }

  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ['El archivo Excel no contiene hojas.'], totalRows: 0, skippedRows: 0 };
  }

  const ws = wb.Sheets[sheetName];
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  });

  if (data.length < 3) {
    return {
      rows: [],
      errors: ['El archivo no contiene suficientes filas.'],
      totalRows: 0,
      skippedRows: 0,
      profile: detectImportProfileFromSheetData(data),
    };
  }

  const profile = detectImportProfileFromSheetData(data);
  const accountResult = parseBancolombiaAccountRows(data, profile);
  if (accountResult.rows.length > 0) return accountResult;

  return parseGenericXLSXRows(data, categories, profile) ?? accountResult;
}
