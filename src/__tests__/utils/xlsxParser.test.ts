import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseXLSX, parseColombianAmount } from '../../utils/xlsxParser';

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Table1');
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return data;
}

describe('parseXLSX', () => {
  it('parses Bancolombia savings account statements with D/MM dates', () => {
    const result = parseXLSX(workbookBuffer([
      ['Información General:'],
      ['DESDE', 'HASTA', 'TIPO CUENTA', 'NRO CUENTA'],
      ['2026/01/01', '2026/01/31', 'CUENTA DE AHORROS', '123'],
      ['Movimientos:'],
      ['FECHA', 'DESCRIPCIÓN', 'SUCURSAL', 'DCTO.', 'VALOR', 'SALDO'],
      ['2/01', 'PAGO DE NOMI EMPRESA', '', '', '271,400.00', '711,420.93'],
      ['4/01', 'COMPRA EN TIENDA', '', '', '-10,500.00', '700,920.93'],
    ]));

    expect(result.errors).toEqual([]);
    expect(result.profile?.id).toBe('bancolombia_account');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ description: 'PAGO DE NOMI EMPRESA', amount: 271400, type: 'income' });
    expect(result.rows[1]).toMatchObject({ description: 'COMPRA EN TIENDA', amount: 10500, type: 'expense' });
  });

  it('parses detailed Mastercard statements with full date headers and positive purchase amounts', () => {
    const result = parseXLSX(workbookBuffer([
      ['Extracto detallado Mastercard Bancolombia'],
      ['Tarjeta de crédito terminada en 1041'],
      ['Fecha de corte', '2026/05/31'],
      [],
      ['Fecha transacción', 'Fecha posteo', 'Descripción', 'Ciudad', 'Valor en pesos', 'Cuotas'],
      ['2026/05/03', '2026/05/04', 'RESTAURANTE PRUEBA', 'MEDELLIN', '45,600.00', '1/1'],
      ['2026/05/10', '2026/05/10', 'PAGO A TARJETA DE CREDITO', '', '-200,000.00', ''],
    ]));

    expect(result.errors).toEqual([]);
    expect(result.profile?.id).toBe('bancolombia_card');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      description: 'RESTAURANTE PRUEBA MEDELLIN',
      amount: 45600,
      type: 'expense',
    });
    expect(result.rows[1]).toMatchObject({
      description: 'PAGO A TARJETA DE CREDITO',
      amount: 200000,
      type: 'transfer',
    });
  });
});

describe('parseColombianAmount', () => {
  it('NO infla ×100 un decimal con coma sin miles (antes "99,99" daba 9999)', () => {
    expect(parseColombianAmount('99,99')).toBe(99.99);
    expect(parseColombianAmount('1,50')).toBe(1.5);
    expect(parseColombianAmount('-99,99')).toBe(-99.99);
  });

  it('sigue parseando miles colombianos y US sin romper', () => {
    expect(parseColombianAmount('1.234.567,89')).toBe(1234567.89);
    expect(parseColombianAmount('271,400.00')).toBe(271400);
  });

  it('passthrough de número y vacíos → null', () => {
    expect(parseColombianAmount(99.99)).toBe(99.99);
    expect(parseColombianAmount('')).toBeNull();
    expect(parseColombianAmount('-')).toBeNull();
    expect(parseColombianAmount(NaN)).toBeNull();
  });

  it('al delegar en parseAmount, ahora quita códigos de moneda (antes daba null)', () => {
    expect(parseColombianAmount('USD 1.234,56')).toBeCloseTo(1234.56, 2);
  });

  it('preserva el contrato null: texto con dígitos NO es monto (parseDescription depende de esto)', () => {
    expect(parseColombianAmount('Calle 50')).toBeNull();
    expect(parseColombianAmount('MEDELLIN')).toBeNull();
    expect(parseColombianAmount('0')).toBe(0); // cero genuino
    expect(parseColombianAmount('0,00')).toBe(0);
  });
});
