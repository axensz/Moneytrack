import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAppUrl } from '../../lib/browserNotifications';

describe('normalizeAppUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('convierte rutas legacy a query canonica y conserva el base path', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/Moneytrack');

    expect(normalizeAppUrl('/budgets')).toBe('/Moneytrack/?view=budgets');
    expect(normalizeAppUrl('/?view=debts')).toBe('/Moneytrack/?view=debts');
  });

  it('no reescribe URLs externas', () => {
    expect(normalizeAppUrl('https://example.com/help')).toBe('https://example.com/help');
  });
});
