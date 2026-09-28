import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationAuthorityState } from '../../utils/notificationAuthority';

// El bridge es puro cableado: combina la hidratación de fuentes (dominio finanzas)
// con la autoridad de notificación y entrega las señales de gate al monitor y al
// recordatorio diario. Mockeamos sus dependencias para verificar EXACTAMENTE qué
// gates propaga, sin re-probar la lógica interna de cada hook.

const state = vi.hoisted(() => ({
  transactionDomain: {
    transactions: [] as unknown[],
    balanceTransactions: [] as unknown[],
    balancesReady: true,
    transactionsLoading: false,
    notificationSourcesHydrated: true,
  },
  authority: {
    kind: 'foreground', effective: 'foreground', configVersion: 4,
    writer: { namespace: 'v4', authorityConfigVersion: 4 },
  } as NotificationAuthorityState,
  monitoringArgs: [] as Array<Record<string, unknown>>,
  dailyArgs: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../hooks/useFinanceSelectors', () => ({
  useTransactionDomain: () => state.transactionDomain,
  useAccountDomain: () => ({ accounts: [] }),
  useRecurringDomain: () => ({ recurringPayments: [] }),
  useBudgetsDomain: () => ({ budgets: [] }),
  useDebtsDomain: () => ({ debts: [] }),
}));

vi.mock('../../contexts/NotificationContext', () => ({
  useNotificationContext: () => ({
    notificationManager: { deps: {} },
    preferences: { timeZone: 'America/Bogota' },
  }),
}));

vi.mock('../../hooks/useNotificationAuthority', () => ({
  useNotificationAuthority: (userId: string | null) => {
    void userId;
    return state.authority;
  },
}));

vi.mock('../../hooks/useNotificationMonitoring', () => ({
  useNotificationMonitoring: (args: Record<string, unknown>) => {
    state.monitoringArgs.push(args);
    return { monitors: {} };
  },
}));

vi.mock('../../hooks/useDailyExpenseReminder', () => ({
  useDailyExpenseReminder: (
    _manager: unknown,
    _prefs: unknown,
    options?: Record<string, unknown>,
  ) => {
    state.dailyArgs.push({ options });
  },
}));

import { FinanceNotificationBridge } from '../../components/layout/FinanceNotificationBridge';

const lastMonitoring = () => state.monitoringArgs.at(-1)!;
const lastDaily = () => state.dailyArgs.at(-1)!;

beforeEach(() => {
  state.monitoringArgs.length = 0;
  state.dailyArgs.length = 0;
  state.transactionDomain = {
    transactions: [], balanceTransactions: [], balancesReady: true,
    transactionsLoading: false, notificationSourcesHydrated: true,
  };
  state.authority = {
    kind: 'foreground', effective: 'foreground', configVersion: 4,
    writer: { namespace: 'v4', authorityConfigVersion: 4 },
  };
});

describe('FinanceNotificationBridge — cableado de hidratación y autoridad', () => {
  it('foreground hidratado: isHydrated y foregroundWriterActive true', () => {
    render(<FinanceNotificationBridge userId="user-1" />);
    expect(lastMonitoring().isHydrated).toBe(true);
    expect(lastMonitoring().foregroundWriterActive).toBe(true);
    expect(lastDaily().options).toMatchObject({ foregroundWriterActive: true });
  });

  it('fuentes NO hidratadas: isHydrated false aunque balancesReady', () => {
    state.transactionDomain.notificationSourcesHydrated = false;
    render(<FinanceNotificationBridge userId="user-1" />);
    expect(lastMonitoring().isHydrated).toBe(false);
  });

  it('balancesReady false: isHydrated false', () => {
    state.transactionDomain.balancesReady = false;
    render(<FinanceNotificationBridge userId="user-1" />);
    expect(lastMonitoring().isHydrated).toBe(false);
  });

  it('autoridad durable: foregroundWriterActive false en monitor y recordatorio diario', () => {
    state.authority = { kind: 'durable', effective: 'durable', configVersion: 9, writer: null };
    render(<FinanceNotificationBridge userId="user-1" />);
    expect(lastMonitoring().foregroundWriterActive).toBe(false);
    expect(lastDaily().options).toMatchObject({ foregroundWriterActive: false });
    // La hidratación de fuentes de saldo/gasto/presupuesto no se apaga por durable.
    expect(lastMonitoring().isHydrated).toBe(true);
  });

  it('cutover (writer null) también apaga el escritor foreground', () => {
    state.authority = { kind: 'transient', effective: 'foreground', reason: 'cutover', writer: null };
    render(<FinanceNotificationBridge userId="user-1" />);
    expect(lastMonitoring().foregroundWriterActive).toBe(false);
    expect(lastDaily().options).toMatchObject({ foregroundWriterActive: false });
  });

  it('propaga el writer token de autoridad al monitor y al recordatorio diario', () => {
    render(<FinanceNotificationBridge userId="user-1" />);
    expect(lastMonitoring().authority).toEqual(state.authority);
    expect(lastDaily().options).toMatchObject({ authority: state.authority });
  });
});
