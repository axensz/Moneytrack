import { describe, expect, it } from 'vitest';
import {
  detectImportProfileFromRows,
  detectImportProfileFromSheetData,
  detectImportProfileFromText,
} from '../../utils/importProfiles';
import type { ParsedRow } from '../../utils/csvParser';

describe('importProfiles', () => {
  it('detects Bancolombia card statements from sheet metadata', () => {
    const profile = detectImportProfileFromSheetData([
      ['Extracto detallado Mastercard Bancolombia'],
      ['Tarjeta de crédito terminada en 1041'],
      ['Fecha de corte', '2026/05/31'],
    ]);

    expect(profile.id).toBe('bancolombia_card');
  });

  it('detects Bancolombia account statements from sheet metadata', () => {
    const profile = detectImportProfileFromSheetData([
      ['Información General:'],
      ['DESDE', 'HASTA', 'TIPO CUENTA', 'NRO CUENTA'],
      ['2026/01/01', '2026/01/31', 'CUENTA DE AHORROS', '123'],
      ['saldo anterior', '1000'],
    ]);

    expect(profile.id).toBe('bancolombia_account');
  });

  it('detects Nu PDF from extracted rows', () => {
    const rows: ParsedRow[] = [{
      date: new Date('2026-05-12T12:00:00'),
      description: 'Gracias por tu pago PAGO PSE NU',
      amount: 300000,
      type: 'transfer',
      suggestedCategory: 'Pago Crédito',
      rawLine: '2026-05-12|Gracias por tu pago PAGO PSE NU|300000',
    }];

    expect(detectImportProfileFromRows(rows, 'pdf').id).toBe('nu_pdf');
  });

  it('falls back to a generic profile by source type', () => {
    expect(detectImportProfileFromText('fecha descripcion monto', 'csv').id).toBe('generic_csv');
  });
});
