import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userBReady: false,
  seenTimeZones: [] as Array<{ userId: string | null; timeZone: string }>,
}));

const emptyAsync = async () => {};
const empty = () => {};

vi.mock('../../hooks/firestore', () => ({
  useFirestoreSubscriptions: (userId: string | null) => ({
    transactions: [], accounts: [], categories: [], transactionBeneficiaries: [],
    recurringPayments: [], debts: [], budgets: [], savingsGoals: [], notifications: [],
    recurringNotificationLifecycles: [], recurringNotificationLifecyclesReady: true,
    notificationPreferences: {
      timeZone: userId === 'user-a' || !state.userBReady
        ? 'Pacific/Kiritimati'
        : 'America/Los_Angeles',
    },
    notificationPreferencesReady: userId === 'user-a' || state.userBReady,
    loading: false, error: null,
    hasMoreTransactions: false, loadingMoreTransactions: false,
    loadMoreTransactions: emptyAsync,
    transactionsServerSettled: true, transactionsHeadExhaustive: true,
    transactionsUnresolvedReason: null, transactionsRetrying: false,
    retryGeneration: 0, retryLoad: empty,
  }),
  useTransactionsCRUD: (
    userId: string | null,
    _accounts: unknown[],
    timeZone: string,
  ) => {
    state.seenTimeZones.push({ userId, timeZone });
    return {
      addTransaction: emptyAsync,
      addCreditPaymentAtomic: emptyAsync,
      addRecurringTransactionAtomic: emptyAsync,
      linkRecurringTransactionAtomic: emptyAsync,
      restoreTransaction: emptyAsync,
      deleteTransaction: emptyAsync,
      updateTransaction: emptyAsync,
    };
  },
  useAccountsCRUD: () => ({
    addAccount: emptyAsync, deleteAccount: emptyAsync, updateAccount: emptyAsync,
  }),
  useCategoriesCRUD: () => ({
    addCategory: emptyAsync, deleteCategory: emptyAsync,
  }),
}));

import { useFirestore } from '../../hooks/useFirestore';

describe('useFirestore — timezone de escritura por cuenta', () => {
  beforeEach(() => {
    state.userBReady = false;
    state.seenTimeZones.length = 0;
  });

  it('no pasa la zona stale de A a CRUD de B y habilita la zona B al hidratarse', () => {
    const { rerender } = renderHook(
      ({ userId, revision: _revision }) => useFirestore(userId),
      { initialProps: { userId: 'user-a' as string | null, revision: 0 } },
    );
    expect(state.seenTimeZones.at(-1)).toEqual({
      userId: 'user-a', timeZone: 'Pacific/Kiritimati',
    });

    rerender({ userId: 'user-b', revision: 0 });
    expect(state.seenTimeZones.at(-1)).toEqual({
      userId: 'user-b', timeZone: 'America/Bogota',
    });

    state.userBReady = true;
    rerender({ userId: 'user-b', revision: 1 });
    expect(state.seenTimeZones.at(-1)).toEqual({
      userId: 'user-b', timeZone: 'America/Los_Angeles',
    });
  });
});
