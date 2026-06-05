import { describe, expect, it } from 'vitest';
import { CREDIT_PAYMENT_CATEGORY } from '../../config/constants';
import { parseCSV, parseAmount, parseDate, suggestCategory, resolveImportCurrency, normalizeCurrencyCode } from '../../utils/csvParser';

describe('parseAmount', () => {
  it('parses Colombian thousands format', () => {
    expect(parseAmount('1.234.567,89')).toBeCloseTo(1234567.89, 2);
    expect(parseAmount('10.000')).toBe(10000);
    expect(parseAmount('COP $ 10.000,00')).toBe(10000);
  });

  it('parses US thousands format', () => {
    expect(parseAmount('1,234,567.89')).toBeCloseTo(1234567.89, 2);
  });

  it('parses USD amounts without corrupting the C/O/P letters (F6)', () => {
    expect(parseAmount('USD $ 99,99')).toBeCloseTo(99.99, 2);
    expect(parseAmount('USD 1,250.50')).toBeCloseTo(1250.5, 2);
  });

  it('parses simple comma decimals', () => {
    expect(parseAmount('99,99')).toBeCloseTo(99.99, 2);
  });

  it('treats accounting parentheses as negative', () => {
    expect(parseAmount('(1.000.000,00)')).toBeCloseTo(-1000000, 2);
    expect(parseAmount('-$ 1.000.000,00')).toBeCloseTo(-1000000, 2);
  });

  it('returns 0 for empty/garbage', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('-')).toBe(0);
    expect(parseAmount('abc')).toBe(0);
  });
});

describe('parseDate', () => {
  const ymd = (d: Date | null) => d && `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  it('parses DD/MM/YYYY (Colombian order)', () => {
    expect(ymd(parseDate('05/04/2026'))).toBe('2026-4-5');
  });

  it('parses ISO YYYY-MM-DD', () => {
    expect(ymd(parseDate('2026-06-01'))).toBe('2026-6-1');
  });

  it('parses textual month dates (Bancolombia/Nu) (F4)', () => {
    expect(ymd(parseDate('27 MAY 2026'))).toBe('2026-5-27');
    expect(ymd(parseDate('04 may 2026'))).toBe('2026-5-4');
    expect(ymd(parseDate('4-may-2026'))).toBe('2026-5-4');
    expect(ymd(parseDate('15 ENE 2025'))).toBe('2025-1-15');
  });

  it('strips trailing time', () => {
    expect(ymd(parseDate('2026-06-01 13:45:00'))).toBe('2026-6-1');
    expect(ymd(parseDate('01/06/2026 13:45'))).toBe('2026-6-1');
  });

  it('returns null for invalid dates', () => {
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate('32/13/2026')).toBeNull();
  });
});

describe('resolveImportCurrency (Fase 4: USD/TRM)', () => {
  it('leaves COP amounts unchanged', () => {
    expect(resolveImportCurrency(50000, 'COP', '')).toEqual({ amount: 50000 });
    expect(resolveImportCurrency(50000, '', '')).toEqual({ amount: 50000 });
  });

  it('converts USD to COP using the TRM and keeps original metadata', () => {
    const r = resolveImportCurrency(10, 'USD', '4000');
    expect(r.amount).toBe(40000);
    expect(r.currency).toBe('COP');
    expect(r.originalAmount).toBe(10);
    expect(r.originalCurrency).toBe('USD');
    expect(r.exchangeRate).toBe(4000);
  });

  it('flags USD without TRM as needsExchangeRate (does not convert)', () => {
    const r = resolveImportCurrency(99.99, 'USD', '');
    expect(r.needsExchangeRate).toBe(true);
    expect(r.originalCurrency).toBe('USD');
    expect(r.currency).toBeUndefined();
  });

  it('normalizeCurrencyCode recognizes common forms', () => {
    expect(normalizeCurrencyCode('USD')).toBe('USD');
    expect(normalizeCurrencyCode('US$')).toBe('USD');
    expect(normalizeCurrencyCode('dólares')).toBe('USD');
    expect(normalizeCurrencyCode('COP')).toBe('COP');
    expect(normalizeCurrencyCode('')).toBe('COP');
    expect(normalizeCurrencyCode('XYZ')).toBeNull();
  });
});

describe('parseCSV multi-currency (Fase 4)', () => {
  it('converts a USD row with TRM to COP and stores original values', () => {
    const result = parseCSV([
      'Fecha;Descripcion;Monto;Moneda;TRM',
      '2026-05-10;Compra Amazon;-99,99;USD;4000',
    ].join('\n'));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].amount).toBe(Math.round(99.99 * 4000));
    expect(result.rows[0].originalAmount).toBeCloseTo(99.99, 2);
    expect(result.rows[0].originalCurrency).toBe('USD');
    expect(result.rows[0].exchangeRate).toBe(4000);
  });

  it('flags a USD row without TRM', () => {
    const result = parseCSV([
      'Fecha;Descripcion;Monto;Moneda',
      '2026-05-10;Compra Amazon;-99,99;USD',
    ].join('\n'));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].needsExchangeRate).toBe(true);
    expect(result.rows[0].originalCurrency).toBe('USD');
  });
});

describe('suggestCategory rules (F: category rules)', () => {
  const cases: Array<[string, string]> = [
    ['OXXO TIENDA', 'Alimentación'],
    ['MERCACENT', 'Alimentación'],
    ['UBER TRIP', 'Transporte'],
    ['SMART FIT', 'Salud'],
    ['MEDIPIEL', 'Salud'],
    ['OPENAI *CHATGPT', 'Servicios'],
    ['ANTHROPIC CLAUDE', 'Servicios'],
    ['MERCADO PAGO *TIENDA', 'Compras Personales'],
    ['CINE CLIMAX', 'Entretenimiento'],
  ];

  it.each(cases)('categorizes "%s" as %s', (description, expected) => {
    expect(suggestCategory(description, 'expense')).toBe(expected);
  });

  it('categorizes Pragma payroll as Salario (income)', () => {
    expect(suggestCategory('PAGO NOMINA PRAGMA SA', 'income')).toBe('Salario');
  });
});

describe('parseCSV', () => {
  it('keeps a matching category from the CSV file', () => {
    const result = parseCSV(
      [
        'fecha,descripcion,monto,categoria',
        '2026-05-10,Compra mercado,-45000,Mercado Casa',
      ].join('\n'),
      { expense: ['Mercado Casa'], income: [] }
    );

    expect(result.errors).toEqual([]);
    expect(result.profile?.id).toBe('generic_csv');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      description: 'Compra mercado',
      type: 'expense',
      suggestedCategory: 'Mercado Casa',
    });
  });

  it('marks PAGO PSE NU as an internal transfer with the credit payment category', () => {
    const result = parseCSV([
      'fecha,descripcion,monto',
      '2026-05-12,PAGO PSE NU,-300000',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      description: 'PAGO PSE NU',
      type: 'transfer',
      suggestedCategory: CREDIT_PAYMENT_CATEGORY,
    });
  });

  it('marks common credit card payment descriptions as transfers', () => {
    const result = parseCSV([
      'fecha,descripcion,monto',
      '2026-05-12,PAGO A TARJETA DE CREDITO,-300000',
      '2026-05-13,PAGO SUC VIRT TC,-250000',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every(row => row.type === 'transfer')).toBe(true);
    expect(result.rows.every(row => row.suggestedCategory === CREDIT_PAYMENT_CATEGORY)).toBe(true);
  });

  it('keeps the simple CSV format working (Fecha;Descripcion;Monto)', () => {
    const result = parseCSV([
      'Fecha;Descripcion;Monto',
      '01/06/2026;Almuerzo restaurante;-25000',
      '15/06/2026;Pago nomina;1500000',
    ].join('\n'));

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ type: 'expense', amount: 25000 });
    expect(result.rows[1]).toMatchObject({ type: 'income', amount: 1500000 });
  });

  it('does not skip rows with textual month dates (F4)', () => {
    const result = parseCSV([
      'fecha,descripcion,monto',
      '27 MAY 2026,Compra OXXO,-15000',
    ].join('\n'));

    expect(result.skippedRows).toBe(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].date.getMonth()).toBe(4); // mayo
    expect(result.rows[0].suggestedCategory).toBe('Alimentación');
  });
});
