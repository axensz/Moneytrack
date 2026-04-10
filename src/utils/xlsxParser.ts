/**
 * Parser de extractos bancarios en formato Excel (.xlsx)
 * Soporta el formato de extractos de Bancolombia (Cuenta de Ahorros / Corriente)
 * con detección automática de metadatos, desbordamiento de columnas y año inferido.
 */

import * as XLSX from 'xlsx';
import type { ParseResult, ParsedRow } from './csvParser';
import { suggestCategory } from './csvParser';

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

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
  if (!str || str === 'nan' || str === '#N/A') return null;

  // Quitar símbolo de moneda y espacios
  let cleaned = str.replace(/[$\sCOP]/g, '');

  // Añadir cero inicial si empieza con punto: ".60" → "0.60"
  cleaned = cleaned.replace(/^(-?)\./, '$10.');

  // Detectar formato colombiano (punto como miles, coma como decimal)
  let normalized: string;
  if (/\d\.\d{3}/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = cleaned.replace(/,/g, '');
  }

  const num = parseFloat(normalized);
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

export function parseXLSX(buffer: ArrayBuffer): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  let skippedRows = 0;
  let totalRows = 0;

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
    };
  }

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

    rows.push({
      date,
      description,
      amount: absAmount,
      type,
      suggestedCategory: suggestCategory(description, type),
      rawLine: (row as unknown[]).map(c => c ?? '').join('|'),
    });
  }

  if (rows.length === 0) {
    if (totalRows > 0) {
      errors.push(
        `Se encontraron ${totalRows} filas con fecha pero no pudieron parsearse. Verifica el formato del archivo.`
      );
    } else {
      errors.push(
        'No se encontraron transacciones. Asegúrate de que sea un extracto bancario de Bancolombia en formato Excel.'
      );
    }
  }

  return { rows, errors, totalRows, skippedRows };
}
