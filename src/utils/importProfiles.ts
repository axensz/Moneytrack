import type { ParsedRow } from './csvParser';
import { normalizeImportText } from './importLearning';

export type ImportSourceType = 'csv' | 'xlsx' | 'pdf';

export type ImportProfileId =
  | 'nu_pdf'
  | 'bancolombia_card'
  | 'bancolombia_account'
  | 'generic_csv'
  | 'generic_xlsx'
  | 'generic_pdf';

export interface ImportProfile {
  id: ImportProfileId;
  label: string;
  institution: 'Nu' | 'Bancolombia' | 'Generico';
  sourceType: ImportSourceType;
}

export const IMPORT_PROFILES: Record<ImportProfileId, ImportProfile> = {
  nu_pdf: {
    id: 'nu_pdf',
    label: 'Nu - Extracto PDF',
    institution: 'Nu',
    sourceType: 'pdf',
  },
  bancolombia_card: {
    id: 'bancolombia_card',
    label: 'Bancolombia - Tarjeta',
    institution: 'Bancolombia',
    sourceType: 'xlsx',
  },
  bancolombia_account: {
    id: 'bancolombia_account',
    label: 'Bancolombia - Cuenta',
    institution: 'Bancolombia',
    sourceType: 'xlsx',
  },
  generic_csv: {
    id: 'generic_csv',
    label: 'CSV generico',
    institution: 'Generico',
    sourceType: 'csv',
  },
  generic_xlsx: {
    id: 'generic_xlsx',
    label: 'Excel generico',
    institution: 'Generico',
    sourceType: 'xlsx',
  },
  generic_pdf: {
    id: 'generic_pdf',
    label: 'PDF generico',
    institution: 'Generico',
    sourceType: 'pdf',
  },
};

function profile(id: ImportProfileId): ImportProfile {
  return IMPORT_PROFILES[id];
}

function includesAny(value: string, keywords: string[]): boolean {
  const normalized = normalizeImportText(value);
  return keywords.some(keyword => normalized.includes(normalizeImportText(keyword)));
}

export function detectImportProfileFromText(text: string, sourceType: ImportSourceType): ImportProfile {
  if (sourceType === 'pdf' && includesAny(text, ['nu bank', 'nufin', 'gracias por tu pago', 'pago pse nu'])) {
    return profile('nu_pdf');
  }

  if (includesAny(text, ['extracto detallado mastercard bancolombia', 'tarjeta de credito', 'fecha de corte'])) {
    return profile('bancolombia_card');
  }

  if (includesAny(text, ['cuenta de ahorros', 'cuenta corriente', 'tipo cuenta', 'saldo anterior'])) {
    return profile('bancolombia_account');
  }

  return profile(sourceType === 'csv' ? 'generic_csv' : sourceType === 'xlsx' ? 'generic_xlsx' : 'generic_pdf');
}

export function detectImportProfileFromSheetData(data: unknown[][]): ImportProfile {
  const sample = data
    .slice(0, 80)
    .map(row => row.map(cell => String(cell ?? '')).join(' '))
    .join(' ');

  return detectImportProfileFromText(sample, 'xlsx');
}

export function detectImportProfileFromRows(rows: ParsedRow[], sourceType: ImportSourceType): ImportProfile {
  const sample = rows
    .slice(0, 80)
    .map(row => `${row.description} ${row.rawLine}`)
    .join(' ');

  return detectImportProfileFromText(sample, sourceType);
}
