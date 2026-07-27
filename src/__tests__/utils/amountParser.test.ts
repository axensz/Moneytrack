import { describe, expect, it } from 'vitest';
import { parseAmount } from '../../utils/amountParser';

describe('parseAmount', () => {
  it('interpreta separadores colombianos', () => {
    expect(parseAmount('1.234.567,89')).toBeCloseTo(1234567.89, 2);
    expect(parseAmount('10.000')).toBe(10000);
    expect(parseAmount('COP $ 10.000,00')).toBe(10000);
  });

  it('interpreta separadores estadounidenses', () => {
    expect(parseAmount('1,234,567.89')).toBeCloseTo(1234567.89, 2);
  });

  it('interpreta montos en USD sin alterar sus letras', () => {
    expect(parseAmount('USD $ 99,99')).toBeCloseTo(99.99, 2);
    expect(parseAmount('USD 1,250.50')).toBeCloseTo(1250.5, 2);
    expect(parseAmount('US$ 99.99')).toBeCloseTo(99.99, 2);
  });

  it('interpreta decimales con coma', () => {
    expect(parseAmount('99,99')).toBeCloseTo(99.99, 2);
  });

  it('interpreta negativos contables', () => {
    expect(parseAmount('(1.000.000,00)')).toBeCloseTo(-1000000, 2);
    expect(parseAmount('-$ 1.000.000,00')).toBeCloseTo(-1000000, 2);
  });

  it('devuelve cero para valores vacíos o inválidos', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('-')).toBe(0);
    expect(parseAmount('abc')).toBe(0);
  });
});
