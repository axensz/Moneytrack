/**
 * Test de integración del pipeline de importación CSV.
 * Ejercita parseCSV de extremo a extremo con un extracto que mezcla:
 * gasto simple, ingreso, transferencia interna, compra a cuotas, fecha textual,
 * categoría desde el archivo y un movimiento en USD con TRM.
 */
import { describe, expect, it } from 'vitest';
import { parseCSV } from '../../utils/csvParser';
import { CREDIT_PAYMENT_CATEGORY } from '../../config/constants';

describe('integration: parseCSV pipeline', () => {
  it('parses a realistic mixed Colombian bank statement', () => {
    const csv = [
      'Fecha;Descripcion;Categoria;Monto;Moneda;TRM',
      '01/06/2026;Compra OXXO;;-25.000;COP;',
      '02/06/2026;Pago Nomina Pragma;;3.500.000;COP;',
      '03/06/2026;PAGO PSE NU;;-300.000;COP;',
      '04 jun 2026;Compra Amazon cuota 1 de 12;;-99,99;USD;4000',
      '05/06/2026;Uber viaje;Transporte;-15.000;COP;',
    ].join('\n');

    const result = parseCSV(csv, { expense: ['Transporte'], income: [] });

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(5);

    const [oxxo, nomina, pagoNu, amazon, uber] = result.rows;

    // Gasto simple → categoría por reglas
    expect(oxxo).toMatchObject({ type: 'expense', amount: 25000, suggestedCategory: 'Alimentación' });

    // Ingreso → Salario por regla "pragma"
    expect(nomina).toMatchObject({ type: 'income', amount: 3500000, suggestedCategory: 'Salario' });

    // Transferencia interna (pago de tarjeta)
    expect(pagoNu).toMatchObject({ type: 'transfer', suggestedCategory: CREDIT_PAYMENT_CATEGORY });

    // USD con TRM → convertido a COP + metadatos + fecha textual + cuotas
    expect(amazon.amount).toBe(Math.round(99.99 * 4000));
    expect(amazon.originalCurrency).toBe('USD');
    expect(amazon.exchangeRate).toBe(4000);
    expect(amazon.date.getMonth()).toBe(5); // junio
    expect(amazon.installments).toBe(12);
    expect(amazon.currentInstallment).toBe(1);

    // Categoría tomada del archivo (no sobrescrita por reglas)
    expect(uber).toMatchObject({ type: 'expense', amount: 15000, suggestedCategory: 'Transporte', categorySource: 'file' });
  });

  it('keeps the minimal CSV (Fecha;Descripcion;Monto) fully working', () => {
    const result = parseCSV([
      'Fecha;Descripcion;Monto',
      '10/06/2026;Mercado;-120.500',
      '11/06/2026;Reembolso;50.000',
    ].join('\n'));

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ type: 'expense', amount: 120500 });
    expect(result.rows[1]).toMatchObject({ type: 'income', amount: 50000 });
    // Sin columnas Moneda/TRM → permanece en COP sin metadatos
    expect(result.rows[0].originalCurrency).toBeUndefined();
  });
});
