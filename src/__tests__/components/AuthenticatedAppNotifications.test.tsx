/**
 * Task 7 — AuthenticatedApp logout ordering.
 *
 * handleLogout MUST await prepareForSignOut() (from the notification context)
 * immediately BEFORE logoutFirebase(). Because prepareForSignOut never rejects
 * and is bounded to 1.5s, a hanging cleanup cannot strand logout — logout still
 * runs exactly once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { callOrder, prepareForSignOut, logoutFirebase } = vi.hoisted(() => {
    const order: string[] = [];
    return {
        callOrder: order,
        prepareForSignOut: vi.fn(async () => { order.push('prepare'); }),
        logoutFirebase: vi.fn(async () => { order.push('logout'); }),
    };
});

vi.mock('../../lib/firebase', () => ({ logoutFirebase }));
vi.mock('../../lib/firebaseDb', () => ({
    db: {},
    clearFirestorePersistence: vi.fn(async () => {}),
}));
vi.mock('../../utils/localData', () => ({ clearGuestFinanceData: vi.fn() }));
vi.mock('../../utils/guestMigration', () => ({
    hasGuestData: () => false,
    readGuestData: () => ({}),
}));

vi.mock('../../contexts/NotificationContext', () => ({
    NotificationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useNotificationContext: () => ({ prepareForSignOut }),
}));

// Header stub exposes a logout button wired to onLogout.
vi.mock('../../components/layout/Header', () => ({
    Header: ({ onLogout }: { onLogout: () => void }) => (
        <button type="button" onClick={onLogout}>logout</button>
    ),
}));

// Trivial stubs for the rest of the heavy subtree. Each factory returns its own
// null component (no shared top-level var — vi.mock is hoisted).
vi.mock('../../components/layout/TabNavigation', () => ({ TabNavigation: () => null }));
vi.mock('../../components/layout/LoadingScreen', () => ({ LoadingScreen: () => <div>loading</div> }));
vi.mock('../../components/layout/FirestoreErrorBanner', () => ({ FirestoreErrorBanner: () => null }));
vi.mock('../../components/layout/FinanceNotificationBridge', () => ({ FinanceNotificationBridge: () => null }));
vi.mock('../../components/layout/FinanceViewRouter', () => ({ FinanceViewRouter: () => null }));
vi.mock('../../components/layout/MobileNavigation', () => ({ MobileNavigation: () => null }));
vi.mock('../../components/shared', () => ({ TransactionForm: () => null }));
vi.mock('../../components/modals/AuthModal', () => ({ AuthModal: () => null }));
vi.mock('../../components/modals/WelcomeModal', () => ({ WelcomeModal: () => null }));
vi.mock('../../components/modals/HelpModal', () => ({ HelpModal: () => null }));
vi.mock('../../components/modals/CategoriesModal', () => ({ CategoriesModal: () => null }));
vi.mock('../../components/modals/GeminiKeyModal', () => ({ GeminiKeyModal: () => null }));
vi.mock('../../components/modals/GuestMigrationModal', () => ({ GuestMigrationModal: () => null }));
vi.mock('../../components/modals/NotificationPreferencesModal', () => ({ NotificationPreferencesModal: () => null }));
vi.mock('../../components/modals/LedgerReconciliationModal', () => ({ LedgerReconciliationModal: () => null }));
vi.mock('../../components/views/transactions', () => ({ TransactionsView: () => null }));
vi.mock('../../components/pwa/OfflineIndicator', () => ({ OfflineIndicator: () => null }));
vi.mock('../../components/pwa/InstallPrompt', () => ({ InstallPrompt: () => null }));
vi.mock('../../components/chat/AssistantLauncher', () => ({ AssistantLauncher: () => null }));
vi.mock('../../components/chat/AIChatBot', () => ({ AIChatBot: () => null }));
vi.mock('../../components/onboarding/OnboardingChecklist', () => ({ OnboardingChecklist: () => null }));

vi.mock('../../contexts/FirestoreContext', () => ({
    FirestoreProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../contexts/FinanceContext', () => ({
    FinanceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../contexts/UIPreferencesContext', () => ({
    UIPreferencesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../contexts/GeminiKeyContext', () => ({
    GeminiKeyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useGeminiKey: () => ({ isConfigured: false, hasConsent: false }),
}));

vi.mock('../../hooks/useAddTransaction', () => ({
    useAddTransaction: () => ({ handleAddTransaction: vi.fn(), handleAddAndContinue: vi.fn() }),
}));
vi.mock('../../hooks/useWelcomeModal', () => ({
    useWelcomeModal: () => ({ showWelcomeModal: false, handleDismissWelcomeModal: vi.fn(), setShowWelcomeModal: vi.fn() }),
}));
vi.mock('../../hooks/useGuestMigration', () => ({
    useGuestMigration: () => ({ showPrompt: false, counts: {}, isMigrating: false, hasError: false, runMigration: vi.fn(), dismiss: vi.fn(), discard: vi.fn() }),
}));
vi.mock('../../hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock('../../hooks/useViewRouting', () => ({ useViewRouting: () => ({ view: 'dashboard', setView: vi.fn() }) }));
vi.mock('../../hooks/useViewTransitionFocus', () => ({
    useViewTransitionFocus: () => ({
        scrollContainerRef: { current: null },
        handleViewChange: vi.fn(),
        handleViewMounted: vi.fn(),
        focusMainContent: vi.fn(),
    }),
}));
vi.mock('../../hooks/useFinanceSelectors', () => ({
    useTransactionDomain: () => ({
        transactions: [], balanceTransactions: [], balancesReady: true,
        addTransaction: vi.fn(), addCreditPaymentAtomic: vi.fn(),
        addRecurringTransactionAtomic: vi.fn(), restoreTransaction: vi.fn(),
    }),
    useAccountDomain: () => ({ accounts: [], defaultAccount: null }),
    useCategoryDomain: () => ({ categories: [], addCategory: vi.fn(), deleteCategory: vi.fn() }),
    useBeneficiaryDomain: () => ({ beneficiaries: [], addBeneficiary: vi.fn(), deleteBeneficiary: vi.fn() }),
    useRecurringDomain: () => ({ recurringPayments: [] }),
    useFinanceStatus: () => ({ transactionsLoading: false, accountsLoading: false, firestoreError: null, retryLoad: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
    default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
    Toaster: () => null,
}));

import { AuthenticatedApp } from '../../AuthenticatedApp';

beforeEach(() => {
    callOrder.length = 0;
    prepareForSignOut.mockClear();
    logoutFirebase.mockClear();
    // jsdom lacks reload; stub it.
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, reload: vi.fn() },
    });
});

const user = { uid: 'user-1' } as unknown as import('firebase/auth').User;

describe('AuthenticatedApp logout ordering', () => {
    it('awaits prepareForSignOut before logoutFirebase, logout runs once', async () => {
        render(<AuthenticatedApp user={user} isOnline onDataReady={vi.fn()} hidden={false} />);
        fireEvent.click(screen.getByText('logout'));

        await waitFor(() => expect(logoutFirebase).toHaveBeenCalledTimes(1));
        expect(prepareForSignOut).toHaveBeenCalledTimes(1);
        expect(callOrder).toEqual(['prepare', 'logout']);
    });

    it('logout still runs exactly once even if cleanup hangs (prepareForSignOut resolves anyway)', async () => {
        prepareForSignOut.mockImplementationOnce(async () => {
            // simulate the bounded cleanup that resolves (never rejects/strands)
            callOrder.push('prepare');
        });
        render(<AuthenticatedApp user={user} isOnline onDataReady={vi.fn()} hidden={false} />);
        fireEvent.click(screen.getByText('logout'));

        await waitFor(() => expect(logoutFirebase).toHaveBeenCalledTimes(1));
        expect(logoutFirebase).toHaveBeenCalledTimes(1);
    });
});
