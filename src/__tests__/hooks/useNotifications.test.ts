import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Notification,
  NotificationPreferences,
  RecurringPayment,
  Transaction,
} from '../../types/finance';

const M = vi.hoisted(() => ({
  firestoreData: {} as Record<string, unknown>,
  addNotification: vi.fn<(notification: unknown) => Promise<boolean>>(async () => true),
  updateNotification: vi.fn<(id: string, updates: unknown) => Promise<void>>(async () => undefined),
  deleteNotification: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  clearAll: vi.fn(async () => undefined),
  markAllAsRead: vi.fn(async () => undefined),
  loggerError: vi.fn(),
  preferences: {} as NotificationPreferences,
  transactionDomain: {} as Record<string, unknown>,
}));

const prefs: NotificationPreferences = {
  schemaVersion: 2,
  timeZone: 'America/Bogota',
  enabled: { budget: true, recurring: true, unusualSpending: true, lowBalance: true, debt: true },
  thresholds: {
    budgetWarning: 80, budgetCritical: 90, budgetExceeded: 100,
    unusualSpending: 200, lowBalance: 100_000,
  },
  quietHours: { enabled: false, startHour: 22, endHour: 7 },
  browserNotifications: { enabled: false },
  dailyExpenseReminder: { enabled: false, hour: 20, minute: 0 },
};

vi.mock('../../contexts/FirestoreContext', () => ({
  useFirestoreData: () => M.firestoreData,
}));
vi.mock('../../hooks/useNotificationStore', () => ({
  useNotificationStore: () => ({
    notifications: [],
    loading: false,
    addNotification: M.addNotification,
    updateNotification: M.updateNotification,
    deleteNotification: M.deleteNotification,
    clearAll: M.clearAll,
    markAllAsRead: M.markAllAsRead,
  }),
}));
vi.mock('../../hooks/useNotificationPreferences', () => ({
  useNotificationPreferences: () => ({
    preferences: M.preferences,
    loading: false,
    updatePreferences: vi.fn(),
  }),
}));
vi.mock('../../hooks/useFinanceSelectors', () => ({
  useTransactionDomain: () => M.transactionDomain,
}));
vi.mock('../../utils/logger', () => ({
  logger: { error: M.loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { useNotifications } from '../../hooks/useNotifications';

const recurringPayment: RecurringPayment = {
  id: 'rent', name: 'Arriendo', amount: 1_500_000, category: 'Vivienda',
  dueDay: 15, frequency: 'monthly', isActive: true,
  createdAt: new Date('2026-01-01T12:00:00.000Z'),
};

const lifecycle = (status: 'active' | 'resolved'): Notification => ({
  id: 'event-rent-june', type: 'recurring', title: 'Arriendo', message: 'vence',
  severity: 'warning', isRead: status === 'resolved',
  createdAt: new Date('2026-06-15T14:00:00.000Z'), schemaVersion: 2,
  eventKey: 'foreground:compat:recurring:rent:2026-5-15', revision: 3,
  stage: 'due', stageWindow: 'due', lifecycleStatus: status,
  resolvedRevision: status === 'resolved' ? 3 : undefined,
  dismissedRevision: 3,
  metadata: {
    recurringPaymentId: 'rent', recurringCycle: '2026-5-15', localDate: '2026-06-15',
  },
});

const linked = (): Transaction => ({
  id: 'tx-rent', type: 'expense', amount: 1_500_000, category: 'Vivienda',
  description: 'Arriendo', date: new Date('2026-06-15T15:00:00.000Z'), paid: true,
  accountId: 'checking', recurringPaymentId: 'rent', recurringCycle: '2026-5-15',
});

const snapshot = ({
  notification = lifecycle('resolved'),
  transactions = [linked()],
  loading = false,
}: {
  notification?: Notification;
  transactions?: Transaction[];
  loading?: boolean;
} = {}) => ({
  notifications: [notification],
  recurringNotificationLifecycles: [notification],
  recurringPayments: [recurringPayment],
  transactions,
  notificationPreferences: prefs,
  loading,
});

describe('useNotifications — recompute tras snapshot financiero persistido', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-16T14:00:00.000Z'));
    M.addNotification.mockReset().mockResolvedValue(true);
    M.updateNotification.mockReset().mockResolvedValue(undefined);
    M.loggerError.mockReset();
    M.preferences = prefs;
    M.transactionDomain = {
      balanceTransactions: [linked()],
      balancesReady: true,
      transactionsServerSettled: true,
      transactionsHeadExhaustive: true,
      transactionsUnresolvedReason: null,
    };
  });
  afterEach(() => vi.useRealTimers());

  it('link resuelve desde hidden raw/source solo después de hidratación', async () => {
    M.firestoreData = snapshot({ notification: lifecycle('active'), loading: true });
    const { rerender } = renderHook(() => useNotifications('user-1'));
    await act(async () => { await Promise.resolve(); });
    expect(M.updateNotification).not.toHaveBeenCalled();

    M.firestoreData = snapshot({ notification: lifecycle('active'), loading: false });
    rerender();

    await waitFor(() => expect(M.updateNotification).toHaveBeenCalledWith(
      'event-rent-june',
      expect.objectContaining({
        lifecycleStatus: 'resolved', isRead: true, readRevision: 3, resolvedRevision: 3,
      }),
    ));
  });

  it('usa la fuente lifecycle dedicada aunque el centro de presentación solo tenga 100 filas más nuevas', async () => {
    const active = lifecycle('active');
    M.firestoreData = {
      ...snapshot({ notification: active }),
      notifications: Array.from({ length: 100 }, (_, index): Notification => ({
        id: `presentation-${index}`,
        type: 'info', title: 'Nueva', message: 'Nueva', severity: 'info', isRead: false,
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
      })),
      recurringNotificationLifecycles: [active],
    };

    renderHook(() => useNotifications('user-1'));

    await waitFor(() => expect(M.updateNotification).toHaveBeenCalledWith(
      'event-rent-june',
      expect.objectContaining({ lifecycleStatus: 'resolved' }),
    ));
  });

  it('unlink reactiva el ciclo actual desde el lifecycle raw resuelto', async () => {
    M.firestoreData = snapshot();
    const { rerender } = renderHook(() => useNotifications('user-1'));
    await act(async () => { await Promise.resolve(); });
    M.addNotification.mockClear();

    M.firestoreData = snapshot({ transactions: [{ ...linked(), recurringPaymentId: undefined, recurringCycle: undefined }] });
    M.transactionDomain = {
      ...M.transactionDomain,
      balanceTransactions: [{ ...linked(), recurringPaymentId: undefined, recurringCycle: undefined }],
    };
    rerender();

    await waitFor(() => expect(M.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 2,
      eventKey: 'foreground:compat:recurring:rent:2026-5-15',
      stage: 'overdue', stageWindow: 'overdue:0', lifecycleStatus: 'active',
    })));
    const candidate = M.addNotification.mock.calls.at(-1)?.[0];
    expect(candidate).not.toHaveProperty('revision');
    expect(candidate).not.toHaveProperty('deliverySource');
  });

  it('delete de la transacción vinculada también reactiva el ciclo vigente', async () => {
    M.firestoreData = snapshot();
    const { rerender } = renderHook(() => useNotifications('user-1'));
    await act(async () => { await Promise.resolve(); });
    M.addNotification.mockClear();

    M.firestoreData = snapshot({ transactions: [] });
    M.transactionDomain = { ...M.transactionDomain, balanceTransactions: [] };
    rerender();

    await waitFor(() => expect(M.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'foreground:compat:recurring:rent:2026-5-15',
      lifecycleStatus: 'active',
    })));
  });

  it('un error de recompute se captura y no invalida el snapshot financiero autoritativo', async () => {
    M.updateNotification.mockRejectedValueOnce(new Error('notification offline'));
    M.firestoreData = snapshot({ notification: lifecycle('active') });

    renderHook(() => useNotifications('user-1'));

    await waitFor(() => expect(M.loggerError).toHaveBeenCalledWith(
      'Recurring notification recompute failed',
      expect.any(Error),
    ));
    expect((M.firestoreData.transactions as Transaction[])[0].recurringPaymentId).toBe('rent');
  });

  it('usa preferences.timeZone para resolver una transacción legacy en el borde local', async () => {
    M.preferences = { ...prefs, timeZone: 'Pacific/Kiritimati' };
    M.firestoreData = snapshot({
      notification: lifecycle('active'),
      transactions: [{
        ...linked(), recurringCycle: undefined,
        date: new Date('2026-06-14T10:00:00.000Z'),
      }],
    });
    M.transactionDomain = {
      ...M.transactionDomain,
      balanceTransactions: [{
        ...linked(), recurringCycle: undefined,
        date: new Date('2026-06-14T10:00:00.000Z'),
      }],
    };

    renderHook(() => useNotifications('user-1'));

    await waitFor(() => expect(M.updateNotification).toHaveBeenCalledWith(
      'event-rent-june',
      expect.objectContaining({ lifecycleStatus: 'resolved' }),
    ));
  });

  it('no resuelve desde un snapshot fromCache aunque contenga un vínculo local', async () => {
    M.transactionDomain = {
      ...M.transactionDomain,
      transactionsServerSettled: false,
      transactionsUnresolvedReason: 'cache',
    };
    M.firestoreData = snapshot({ notification: lifecycle('active') });

    renderHook(() => useNotifications('user-1'));
    await act(async () => { await Promise.resolve(); });

    expect(M.updateNotification).not.toHaveBeenCalled();
  });

  it('no reactiva desde pending writes aunque la vista local ya no muestre el vínculo', async () => {
    M.transactionDomain = {
      ...M.transactionDomain,
      balanceTransactions: [],
      transactionsServerSettled: false,
      transactionsUnresolvedReason: 'pending-writes',
    };
    M.firestoreData = snapshot({ notification: lifecycle('resolved'), transactions: [] });

    renderHook(() => useNotifications('user-1'));
    await act(async () => { await Promise.resolve(); });

    expect(M.addNotification).not.toHaveBeenCalled();
  });

  it('usa la prueba server-confirmed completa cuando el match exacto queda detrás de la fila 500', async () => {
    const head = Array.from({ length: 500 }, (_, index): Transaction => ({
      ...linked(), id: `head-${index}`, recurringPaymentId: undefined, recurringCycle: undefined,
    }));
    const behindHead = linked();
    M.transactionDomain = {
      ...M.transactionDomain,
      balanceTransactions: [...head, behindHead],
      balancesReady: true,
      transactionsServerSettled: true,
      transactionsHeadExhaustive: false,
    };
    M.firestoreData = snapshot({ notification: lifecycle('active'), transactions: head });

    renderHook(() => useNotifications('user-1'));

    await waitFor(() => expect(M.updateNotification).toHaveBeenCalledWith(
      'event-rent-june',
      expect.objectContaining({ lifecycleStatus: 'resolved' }),
    ));
  });

  it('difiere cuando el head está saturado y el historial completo aún no está listo', async () => {
    M.transactionDomain = {
      ...M.transactionDomain,
      balanceTransactions: [],
      balancesReady: false,
      transactionsServerSettled: true,
      transactionsHeadExhaustive: false,
    };
    M.firestoreData = snapshot({ notification: lifecycle('resolved'), transactions: [] });

    renderHook(() => useNotifications('user-1'));
    await act(async () => { await Promise.resolve(); });

    expect(M.addNotification).not.toHaveBeenCalled();
  });
});
