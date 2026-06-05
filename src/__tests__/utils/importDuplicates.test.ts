import { describe, expect, it } from 'vitest';
import { exactImportKey, transferImportKey, importDescKey } from '../../utils/importDuplicates';

describe('importDuplicates', () => {
  it('transferImportKey ignores description so cross-statement payments collide (F7)', () => {
    const date = new Date('2026-05-12T12:00:00');
    // Mismo pago visto en dos extractos con textos distintos
    const bancoKey = transferImportKey(date, 300000);
    const tarjetaKey = transferImportKey(date, 300000);
    expect(bancoKey).toBe(tarjetaKey);
  });

  it('transferImportKey distinguishes different amounts/days', () => {
    const d1 = new Date('2026-05-12T12:00:00');
    const d2 = new Date('2026-05-13T12:00:00');
    expect(transferImportKey(d1, 300000)).not.toBe(transferImportKey(d1, 300001));
    expect(transferImportKey(d1, 300000)).not.toBe(transferImportKey(d2, 300000));
  });

  it('exactImportKey uses description so distinct purchases do not collide', () => {
    const date = new Date('2026-05-12T12:00:00');
    const a = exactImportKey('expense', date, 50000, 'OXXO centro');
    const b = exactImportKey('expense', date, 50000, 'Panaderia esquina');
    expect(a).not.toBe(b);
  });

  it('importDescKey normalizes accents, case and whitespace', () => {
    expect(importDescKey('  PAGO   Tarjetá ')).toBe(importDescKey('pago tarjeta'));
  });
});
