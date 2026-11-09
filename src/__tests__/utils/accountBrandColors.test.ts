import { describe, it, expect } from 'vitest';
import {
  getAccountBrand,
  getBrandByKey,
  getRingSegmentColor,
  RING_SEGMENT_COUNT,
  type AccountBrandKey,
} from '../../components/views/accounts/utils/accountBrandColors';

/**
 * Contraste WCAG AA del texto BLANCO sobre los gradientes de marca de las
 * tarjetas billetera. Ambos stops (`from`/`to`) deben dar ≥4.5:1 con blanco,
 * porque el texto de la tarjeta va en blanco sobre todo el gradiente.
 */

// Luminancia relativa WCAG a partir de un hex.
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

// Ratio de contraste entre blanco (#fff) y un color.
function contrastWithWhite(hex: string): number {
  const L = luminance(hex);
  const white = 1;
  return (white + 0.05) / (L + 0.05);
}

const ALL_KEYS: AccountBrandKey[] = ['violet', 'green', 'cyan', 'blue', 'rose', 'amber', 'slate'];

describe('accountBrandColors — contraste AA del texto blanco sobre el gradiente', () => {
  it('cada stop de cada marca cumple ≥4.5:1 con texto blanco', () => {
    for (const key of ALL_KEYS) {
      const brand = getBrandByKey(key);
      expect(contrastWithWhite(brand.from), `${key} from`).toBeGreaterThanOrEqual(4.5);
      expect(contrastWithWhite(brand.to), `${key} to`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('el stop `from` siempre es igual o más oscuro que el `to`', () => {
    for (const key of ALL_KEYS) {
      const brand = getBrandByKey(key);
      expect(luminance(brand.from)).toBeLessThanOrEqual(luminance(brand.to));
    }
  });
});

describe('accountBrandColors — asignación por nombre', () => {
  it('reconoce marcas conocidas de forma determinista', () => {
    expect(getAccountBrand('Nu Crédito').key).toBe('violet');
    expect(getAccountBrand('RappiCard').key).toBe('cyan');
    expect(getAccountBrand('Nequi').key).toBe('cyan');
    expect(getAccountBrand('Bancolombia Ahorros').key).toBe('amber');
  });

  it('es insensible a mayúsculas y acentos', () => {
    expect(getAccountBrand('nu crédito').key).toBe(getAccountBrand('NU CREDITO').key);
  });

  it('asigna un color estable del pool a nombres sin regla (nunca sin color)', () => {
    const a = getAccountBrand('Cooperativa XYZ');
    const b = getAccountBrand('Cooperativa XYZ');
    expect(a.key).toBe(b.key);
    expect(ALL_KEYS).toContain(a.key);
  });
});

/**
 * El ANILLO de distribución NO usa colores de marca (naranja/ámbar/rosa) sino
 * una rampa DENTRO del sistema de diseño (tokens `--ring-seg-*` de theme.css).
 * Estos tests fijan ese contrato: color posicional, estable, con wrap-around y
 * siempre un token del sistema (nunca un literal de marca).
 */
describe('getRingSegmentColor — rampa del anillo dentro del sistema', () => {
  it('expone exactamente 6 tonos del sistema', () => {
    expect(RING_SEGMENT_COUNT).toBe(6);
  });

  it('devuelve un token CSS del sistema (--ring-seg-*), no un color crudo de marca', () => {
    for (let i = 0; i < RING_SEGMENT_COUNT; i += 1) {
      expect(getRingSegmentColor(i)).toBe(`var(--ring-seg-${i + 1})`);
    }
  });

  it('es posicional y estable (mismo índice → mismo color)', () => {
    expect(getRingSegmentColor(0)).toBe(getRingSegmentColor(0));
    expect(getRingSegmentColor(1)).not.toBe(getRingSegmentColor(0));
  });

  it('hace wrap-around para más cuentas que tonos y acepta índices negativos', () => {
    expect(getRingSegmentColor(RING_SEGMENT_COUNT)).toBe(getRingSegmentColor(0));
    expect(getRingSegmentColor(RING_SEGMENT_COUNT + 2)).toBe(getRingSegmentColor(2));
    expect(getRingSegmentColor(-1)).toBe(getRingSegmentColor(RING_SEGMENT_COUNT - 1));
  });
});
