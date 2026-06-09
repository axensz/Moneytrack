/**
 * A3 — SpendingAnalyzer: detección de gasto inusual.
 *
 * Requiere >= 3 transacciones de la categoría en los últimos 90 días. Alerta si el
 * monto > promedio * (unusualSpending% / 100). Con default 200% → alerta si supera
 * el DOBLE del promedio. Fixtures justo bajo/en el umbral. Audit A3.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpendingAnalyzer } from '../../services/SpendingAnalyzer';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../types/finance';
import type { Transaction } from '../../types/finance';

let n = 0;
const tx = (amount: number, date: string, o: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, type: 'expense', amount, category: 'Comida', description: '',
  date: new Date(date), paid: true, accountId: 'a',
  ...o,
} as Transaction);

// 3 gastos de 10.000 en los últimos 90 días → promedio 10.000, historia mínima OK.
const history = () => [tx(10_000, '2026-05-01'), tx(10_000, '2026-05-20'), tx(10_000, '2026-06-05')];

const setup = (transactions: Transaction[]) => {
  const createNotification = vi.fn().mockResolvedValue(undefined);
  const analyzer = new SpendingAnalyzer({
    createNotification, preferences: DEFAULT_NOTIFICATION_PREFERENCES, transactions,
  });
  return { analyzer, createNotification };
};

describe('SpendingAnalyzer — gasto inusual (A3)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T12:00:00')); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('alerta cuando el gasto supera el doble del promedio (20.001 > 20.000)', async () => {
    const { analyzer, createNotification } = setup(history());
    await analyzer.evaluateUnusualSpending(tx(20_001, '2026-06-15'));
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect((createNotification.mock.calls[0][0] as { type: string }).type).toBe('unusual_spending');
  });

  it('NO alerta justo en el umbral (20.000 no es > 20.000)', async () => {
    const { analyzer, createNotification } = setup(history());
    await analyzer.evaluateUnusualSpending(tx(20_000, '2026-06-15'));
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('NO alerta sin historia mínima (< 3 transacciones)', async () => {
    const { analyzer, createNotification } = setup([tx(10_000, '2026-05-01'), tx(10_000, '2026-06-05')]);
    await analyzer.evaluateUnusualSpending(tx(999_999, '2026-06-15'));
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('ignora transacciones no pagadas', async () => {
    const { analyzer, createNotification } = setup(history());
    await analyzer.evaluateUnusualSpending(tx(20_001, '2026-06-15', { paid: false }));
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('ignora categorías especiales (ajustes)', async () => {
    const { analyzer, createNotification } = setup(history());
    await analyzer.evaluateUnusualSpending(tx(20_001, '2026-06-15', { category: 'Ajuste' }));
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('ignora ingresos', async () => {
    const { analyzer, createNotification } = setup(history());
    await analyzer.evaluateUnusualSpending(tx(20_001, '2026-06-15', { type: 'income' }));
    expect(createNotification).not.toHaveBeenCalled();
  });
});
