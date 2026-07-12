import { describe, expect, it } from 'vitest';
import { parseInterestRateInput } from '../../components/views/accounts/components/AccountFormModal';

describe('parseInterestRateInput', () => {
  it('interpreta una tasa entera como porcentaje entero', () => {
    expect(parseInterestRateInput('24')).toEqual({ display: '24', rate: 24 });
  });

  it('acepta coma o punto decimal sin desplazar dos posiciones', () => {
    expect(parseInterestRateInput('23,99')).toEqual({ display: '23,99', rate: 23.99 });
    expect(parseInterestRateInput('23.99')).toEqual({ display: '23,99', rate: 23.99 });
  });

  it('limita la precision visual a dos decimales', () => {
    expect(parseInterestRateInput('24,567')).toEqual({ display: '24,56', rate: 24.56 });
  });
});
