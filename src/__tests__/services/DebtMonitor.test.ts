/**
 * A3 — DebtMonitor: umbrales de recordatorio de deudas/préstamos.
 *
 * Espiamos getDaysOutstanding para aislar el despacho por umbral:
 *  - borrowed (debes): 30 días → info, 60 días → warning.
 *  - lent (te deben):  90 días → info.
 * Fixtures justo bajo/en cada umbral. Audit A3.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DebtMonitor } from '../../services/DebtMonitor';
import type { Debt } from '../../types/finance';

const makeDebt = (o: Partial<Debt> = {}): Debt => ({
  id: 'd1', personName: 'Juan', type: 'borrowed', originalAmount: 1000,
  remainingAmount: 1000, isSettled: false, createdAt: new Date('2026-01-01'),
  ...o,
});

const setup = (debts: Debt[]) => {
  const createNotification = vi.fn().mockResolvedValue(undefined);
  const monitor = new DebtMonitor({ createNotification, debts });
  return { monitor, createNotification };
};

afterEach(() => vi.restoreAllMocks());

describe('DebtMonitor — umbrales (A3)', () => {
  it('borrowed: NO notifica antes de 30 días (29)', async () => {
    const { monitor, createNotification } = setup([makeDebt({ type: 'borrowed' })]);
    vi.spyOn(monitor, 'getDaysOutstanding').mockReturnValue(29);
    await monitor.checkOverdueDebts();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('borrowed: a 30 días notifica info', async () => {
    const { monitor, createNotification } = setup([makeDebt({ type: 'borrowed' })]);
    vi.spyOn(monitor, 'getDaysOutstanding').mockReturnValue(30);
    await monitor.checkOverdueDebts();
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect((createNotification.mock.calls[0][0] as { severity: string }).severity).toBe('info');
  });

  it('borrowed: a 60 días escala a warning', async () => {
    const { monitor, createNotification } = setup([makeDebt({ type: 'borrowed' })]);
    vi.spyOn(monitor, 'getDaysOutstanding').mockReturnValue(60);
    await monitor.checkOverdueDebts();
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect((createNotification.mock.calls[0][0] as { severity: string }).severity).toBe('warning');
  });

  it('lent: NO notifica antes de 90 días (89)', async () => {
    const { monitor, createNotification } = setup([makeDebt({ type: 'lent' })]);
    vi.spyOn(monitor, 'getDaysOutstanding').mockReturnValue(89);
    await monitor.checkOverdueDebts();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('lent: a 90 días notifica', async () => {
    const { monitor, createNotification } = setup([makeDebt({ type: 'lent' })]);
    vi.spyOn(monitor, 'getDaysOutstanding').mockReturnValue(90);
    await monitor.checkOverdueDebts();
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('ignora deudas saldadas', async () => {
    const { monitor, createNotification } = setup([makeDebt({ isSettled: true })]);
    vi.spyOn(monitor, 'getDaysOutstanding').mockReturnValue(120);
    await monitor.checkOverdueDebts();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('no repite el recordatorio el mismo día (dedup en memoria)', async () => {
    const { monitor, createNotification } = setup([makeDebt({ type: 'borrowed' })]);
    vi.spyOn(monitor, 'getDaysOutstanding').mockReturnValue(60);
    await monitor.checkOverdueDebts();
    monitor.resetLastCheck(); // permitir un segundo barrido el mismo día
    await monitor.checkOverdueDebts();
    // shouldSendReminder exige 7 días entre avisos → solo el primero.
    expect(createNotification).toHaveBeenCalledTimes(1);
  });
});
