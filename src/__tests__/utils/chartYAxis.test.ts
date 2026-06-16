/**
 * Y_AXIS_CONFIG.tickFormatter (#stats-yaxis): antes `(v/1000).toFixed(0)+'k'`
 * colapsaba todo <1000 a "0k" y daba "-0k". Ahora muestra montos pequeños tal
 * cual, miles como "Nk" y millones como "N.NM".
 */
import { describe, it, expect } from 'vitest';
import { Y_AXIS_CONFIG } from '../../components/views/stats/config/chartConfig';

const fmt = Y_AXIS_CONFIG.tickFormatter;

describe('Y_AXIS_CONFIG.tickFormatter', () => {
  it('no colapsa los montos pequeños a "0k"', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(800)).toBe('800');
    expect(fmt(-500)).toBe('-500');
  });

  it('formatea miles y millones de forma compacta', () => {
    expect(fmt(1500)).toBe('1.5k');
    expect(fmt(50_000)).toBe('50k');
    expect(fmt(1_000_000)).toBe('1.0M');
  });

  it('no produce NaN para valores no finitos', () => {
    expect(fmt(NaN)).toBe('0');
  });
});
