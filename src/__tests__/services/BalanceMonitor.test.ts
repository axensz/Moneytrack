/**
 * A3 — BalanceMonitor: alerta de saldo bajo (balance < umbral) + cooldown 24h.
 *
 * Espiamos getAccountBalance para fijar el saldo y probar el límite exacto:
 *  - savings: umbral configurable (default 100.000). Alerta SOLO si balance < umbral.
 *  - credit: umbral 0 (cupo agotado).
 * Audit A3.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BalanceMonitor } from '../../services/BalanceMonitor';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../types/finance';
import type { Account } from '../../types/finance';

const savings: Account = { id: 'sav', name: 'Banco', type: 'savings', isDefault: true, initialBalance: 0 };
const credit: Account = { id: 'cc', name: 'Visa', type: 'credit', isDefault: false, initialBalance: 0, creditLimit: 1_000_000, usedCredit: 0 };

const setup = (accounts: Account[]) => {
  const createNotification = vi.fn().mockResolvedValue(undefined);
  const monitor = new BalanceMonitor({
    createNotification,
    preferences: DEFAULT_NOTIFICATION_PREFERENCES, // lowBalance: 100000
    accounts,
    transactions: [],
  });
  return { monitor, createNotification };
};

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('BalanceMonitor — umbral de saldo bajo (A3)', () => {
  it('savings: alerta cuando el saldo es MENOR al umbral (99.999 < 100.000)', async () => {
    const { monitor, createNotification } = setup([savings]);
    vi.spyOn(monitor, 'getAccountBalance').mockReturnValue(99_999);
    await monitor.evaluateBalanceAlerts('sav');
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect((createNotification.mock.calls[0][0] as { type: string }).type).toBe('low_balance');
  });

  it('savings: NO alerta en el umbral exacto (100.000 no es < 100.000)', async () => {
    const { monitor, createNotification } = setup([savings]);
    vi.spyOn(monitor, 'getAccountBalance').mockReturnValue(100_000);
    await monitor.evaluateBalanceAlerts('sav');
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('credit: umbral 0 — alerta solo con saldo negativo (cupo excedido)', async () => {
    const { monitor, createNotification } = setup([credit]);
    vi.spyOn(monitor, 'getAccountBalance').mockReturnValue(-1);
    await monitor.evaluateBalanceAlerts('cc');
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('credit: NO alerta con cupo disponible (0 no es < 0)', async () => {
    const { monitor, createNotification } = setup([credit]);
    vi.spyOn(monitor, 'getAccountBalance').mockReturnValue(0);
    await monitor.evaluateBalanceAlerts('cc');
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('cuenta inexistente: no-op', async () => {
    const { monitor, createNotification } = setup([savings]);
    await monitor.evaluateBalanceAlerts('no-existe');
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('cooldown: no repite la alerta dentro de 24h, sí la repite después', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T08:00:00'));
    const { monitor, createNotification } = setup([savings]);
    vi.spyOn(monitor, 'getAccountBalance').mockReturnValue(50_000);

    await monitor.evaluateBalanceAlerts('sav');
    await monitor.evaluateBalanceAlerts('sav'); // dentro del cooldown
    expect(createNotification).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-06-16T09:00:00')); // +25h
    await monitor.evaluateBalanceAlerts('sav');
    expect(createNotification).toHaveBeenCalledTimes(2);
  });
});
