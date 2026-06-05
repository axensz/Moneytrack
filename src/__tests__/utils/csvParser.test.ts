import { describe, expect, it } from 'vitest';
import { CREDIT_PAYMENT_CATEGORY } from '../../config/constants';
import { parseCSV } from '../../utils/csvParser';

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
});
