'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Activity, BarChart3, Wallet, Repeat } from 'lucide-react';
import { Header } from './components/layout/Header';
import { TabNavigation } from './components/layout/TabNavigation';
import { LoadingScreen } from './components/layout/LoadingScreen';
import { StatsCards, TransactionForm } from './components/shared';
import { AuthModal } from './components/modals/AuthModal';
import { WelcomeModal } from './components/modals/WelcomeModal';
import { HelpModal } from './components/modals/HelpModal';
import { CategoriesModal } from './components/modals/CategoriesModal';
import { FirestoreProvider } from './contexts/FirestoreContext';
import { FinanceProvider, useFinance } from './contexts/FinanceContext';
import { TransactionsView } from './components/views/transactions';
import { useAuth } from './hooks/useAuth';
import { useAddTransaction } from './hooks/useAddTransaction';
import { useFilteredData } from './hooks/useFilteredData';
import { useWelcomeModal } from './hooks/useWelcomeModal';
import { useNotifications } from './hooks/useNotifications';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { TOAST_CONFIG, INITIAL_TRANSACTION } from './config/constants';
import { logger } from './utils/logger';
import type { NewTransaction, ViewType, FilterValue } from './types/finance';
import { logoutFirebase } from './lib/firebase';
import type { User } from 'firebase/auth';
import { OfflineBanner } from './components/layout/OfflineBanner';
import { AIChatBot } from './components/chat/AIChatBot';

// Lazy-loaded secondary views
const StatsView = lazy(() =>
  import('./components/views/stats/StatsView').then(m => ({ default: m.StatsView }))
);
const AccountsView = lazy(() =>
  import('./components/views/accounts/AccountsView').then(m => ({ default: m.AccountsView }))
);
const RecurringPaymentsView = lazy(() =>
  import('./components/views/recurring/RecurringPaymentsView').then(m => ({ default: m.RecurringPaymentsView }))
);

const ViewFallback = () => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
  </div>
);

/**
 * Outer wrapper: manages auth + provides single Firestore context
 * (eliminates triple-listener bug)
 */
const FinanceTracker = () => {
  const [mounted, setMounted] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { user, loading: authLoading } = useAuth();
  const { isOnline } = useNetworkStatus();

  // Mostrar UNA sola pantalla de carga que cubre auth + data loading
  // Solo se oculta cuando dataReady es true (los datos ya cargaron)
  const showLoading = !mounted || authLoading || (user && !dataReady);

  return (
    <>
      {showLoading && <LoadingScreen />}
      {mounted && !authLoading && (
        <div style={{ display: showLoading ? 'none' : undefined }}>
          <FirestoreProvider userId={user?.uid || null}>
            <FinanceProvider userId={user?.uid || null}>
              <FinanceTrackerContent
                user={user}
                isOnline={isOnline}
                onDataReady={setDataReady}
              />
            </FinanceProvider>
          </FirestoreProvider>
        </div>
      )}
    </>
  );
};

/**
 * Inner component: UI logic, consuming shared FinanceContext
 */
const FinanceTrackerContent = ({ user, isOnline, onDataReady }: { user: User | null; isOnline: boolean; onDataReady: (ready: boolean) => void }) => {
  const {
    transactions,
    accounts,
    categories,
    recurringPayments,
    defaultAccount,
    totalBalance,
    transactionsLoading,
    accountsLoading,
    addTransaction,
    addCreditPaymentAtomic,
    deleteCategory,
    addCategory,
    updateRecurringPayment,
    getDaysUntilDue,
    getAccountBalance,
    formatCurrency,
  } = useFinance();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const newTransactionRef = useRef<NewTransaction>({ ...INITIAL_TRANSACTION });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
  const [view, setView] = useState<ViewType>('transactions');
  const [filterCategory, setFilterCategory] = useState<FilterValue>('all');
  const [filterAccount, setFilterAccount] = useState<FilterValue>('all');
  const [dateRange, setDateRange] = useState<import('./types/finance').DateRange>({ preset: 'this-month' });

  const { dynamicStats, dynamicTotalBalance, balanceLabel } = useFilteredData({
    transactions, accounts, filterAccount, filterCategory, dateRange, totalBalance, getAccountBalance,
  });

  const [newTransaction, setNewTransaction] = useState<NewTransaction>({
    ...INITIAL_TRANSACTION
  });

  // Keep ref in sync for stable callbacks
  useEffect(() => { newTransactionRef.current = newTransaction; }, [newTransaction]);

  const { showWelcomeModal, handleDismissWelcomeModal, setShowWelcomeModal } = useWelcomeModal({
    mounted: true,
    authLoading: false,
    accountsLoading,
    accountsCount: accounts.length,
  });

  const { checkAndNotifyPayments } = useNotifications();

  useEffect(() => {
    if (!recurringPayments.length) return;
    const lastCheckDate = localStorage.getItem('lastNotificationCheck');
    const today = new Date().toDateString();
    if (lastCheckDate === today) return;
    const timer = setTimeout(() => {
      checkAndNotifyPayments(recurringPayments, getDaysUntilDue);
      localStorage.setItem('lastNotificationCheck', today);
    }, 5000);
    return () => clearTimeout(timer);
  }, [recurringPayments, getDaysUntilDue, checkAndNotifyPayments]);

  // Memoized keyboard shortcuts (prevents array recreation each render)
  const shortcuts = useMemo(() => [
    {
      key: 'n', modifiers: ['ctrl' as const],
      description: 'Nueva transacción',
      action: () => { if (accounts.length > 0) { setShowForm(true); setView('transactions'); } }
    },
    { key: '1', modifiers: ['alt' as const], description: 'Ir a Transacciones', action: () => setView('transactions') },
    { key: '2', modifiers: ['alt' as const], description: 'Ir a Cuentas', action: () => setView('accounts') },
    { key: '3', modifiers: ['alt' as const], description: 'Ir a Pagos Periódicos', action: () => setView('recurring') },
    { key: '4', modifiers: ['alt' as const], description: 'Ir a Estadísticas', action: () => setView('stats') },
    { key: 'h', modifiers: ['ctrl' as const], description: 'Abrir ayuda', action: () => setShowHelpModal(true) },
    {
      key: 'Escape', description: 'Cerrar modal',
      action: () => { setShowForm(false); setShowHelpModal(false); setShowCategoriesModal(false); setIsAuthModalOpen(false); },
      preventDefault: false
    }
  ], [accounts.length]);

  useKeyboardShortcuts(shortcuts, { enabled: true, announceShortcuts: true });

  const { handleAddTransaction, handleAddAndContinue } = useAddTransaction({
    accounts, transactions, recurringPayments,
    defaultAccount: defaultAccount || null,
    addTransaction, addCreditPaymentAtomic, updateRecurringPayment,
    setNewTransaction, setShowForm, setShowWelcomeModal,
  });

  const handleLogout = useCallback(async () => {
    try {
      setIsLoggingOut(true);
      await logoutFirebase();
      await new Promise(resolve => setTimeout(resolve, 800));
      toast.success('Sesión cerrada correctamente');
    } catch (error) {
      logger.error('Error al cerrar sesión', error);
      toast.error('Error al cerrar sesión');
    } finally {
      setIsLoggingOut(false);
    }
  }, []);

  const handleCloseAuthModal = useCallback(() => setIsAuthModalOpen(false), []);
  const handleOpenHelpModal = useCallback(() => setShowHelpModal(true), []);
  const handleOpenCategories = useCallback(() => setShowCategoriesModal(true), []);
  const handleCloseCategories = useCallback(() => setShowCategoriesModal(false), []);
  const handleCloseHelpModal = useCallback(() => setShowHelpModal(false), []);
  const handleCloseForm = useCallback(() => { setBatchCount(0); setShowForm(false); }, []);
  const handleRestoreTransaction = useCallback(
    (t: Omit<import('./types/finance').Transaction, 'id' | 'createdAt'>) => addTransaction(t),
    [addTransaction]
  );

  // Stable callbacks for TransactionForm (use ref to avoid re-creation on every keystroke)
  const handleSubmit = useCallback(() => {
    setBatchCount(0);
    handleAddTransaction(newTransactionRef.current);
  }, [handleAddTransaction]);

  const handleSubmitAndContinue = useCallback(async () => {
    const success = await handleAddAndContinue(newTransactionRef.current);
    if (success) setBatchCount(prev => prev + 1);
  }, [handleAddAndContinue]);

  const handleGoToAccounts = useCallback(() => {
    handleDismissWelcomeModal();
    setView('accounts');
  }, [handleDismissWelcomeModal]);

  // Notificar al padre cuando los datos están listos
  const isDataLoading = user && (accountsLoading || transactionsLoading);
  useEffect(() => {
    onDataReady(!isDataLoading);
  }, [isDataLoading, onDataReady]);

  if (isLoggingOut) {
    return <LoadingScreen message="Cerrando sesión..." variant="logout" />;
  }

  return (
    <div className="flex flex-col h-screen bg-background bg-gradient-to-br from-violet-50/30 via-purple-50/20 to-fuchsia-50/10 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Banner de sin conexión */}
      <OfflineBanner isOnline={isOnline} />

      {/* Mobile Bottom Navigation - Fixed at bottom, FUERA del contenedor scrollable */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 shadow-lg safe-area-bottom"
        aria-label="Navegación principal"
        role="navigation"
      >
        <div className="flex justify-around items-center px-2 py-2 pb-2" role="tablist">
          {[
            { key: 'transactions' as ViewType, label: 'Transacciones', icon: Activity },
            { key: 'accounts' as ViewType, label: 'Cuentas', icon: Wallet },
            { key: 'recurring' as ViewType, label: 'Periódicos', icon: Repeat },
            { key: 'stats' as ViewType, label: 'Estadísticas', icon: BarChart3 }
          ].map(tab => (
            <button
              key={tab.key}
              id={`tab-${tab.key}-mobile`}
              role="tab"
              aria-selected={view === tab.key}
              aria-controls={`panel-${tab.key}`}
              onClick={() => {
                // Solo hacer scroll al inicio si ya estamos en la misma pestaña
                if (view === tab.key) {
                  scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  // Cambiar de pestaña sin animación de scroll
                  scrollContainerRef.current?.scrollTo({ top: 0 });
                  setView(tab.key);
                }
              }}
              className={`flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[70px] rounded-xl transition-all ${
                view === tab.key
                  ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 scale-105'
                  : 'text-gray-500 dark:text-gray-400 active:scale-95 active:bg-gray-100 dark:active:bg-gray-800'
              }`}
            >
              <tab.icon size={22} strokeWidth={view === tab.key ? 2.5 : 2} aria-hidden="true" />
              <span className="text-[10px] font-semibold">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <Toaster
        position={TOAST_CONFIG.position}
        containerStyle={TOAST_CONFIG.containerStyle}
        toastOptions={{
          duration: TOAST_CONFIG.duration,
          style: TOAST_CONFIG.style,
          success: TOAST_CONFIG.success,
          error: TOAST_CONFIG.error,
        }}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={handleCloseAuthModal}
      />

      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={handleDismissWelcomeModal}
        onGoToAccounts={handleGoToAccounts}
      />

      <HelpModal
        isOpen={showHelpModal}
        onClose={handleCloseHelpModal}
      />

      <CategoriesModal
        isOpen={showCategoriesModal}
        onClose={handleCloseCategories}
        categories={categories}
        addCategory={addCategory}
        deleteCategory={deleteCategory}
      />

      <Header
        user={user}
        setIsAuthModalOpen={setIsAuthModalOpen}
        showSettingsMenu={showSettingsMenu}
        setShowSettingsMenu={setShowSettingsMenu}
        onOpenHelp={handleOpenHelpModal}
        onOpenCategories={handleOpenCategories}
        onLogout={handleLogout}
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 pb-24 sm:pb-6">
          <div className="max-w-7xl mx-auto">
            <TabNavigation
              view={view}
              setView={setView}
            />

            <StatsCards
              totalBalance={dynamicTotalBalance}
              totalIncome={dynamicStats.totalIncome}
              totalExpenses={dynamicStats.totalExpenses}
              pendingExpenses={dynamicStats.pendingExpenses}
              formatCurrency={formatCurrency}
              balanceLabel={balanceLabel}
            />

            {view === 'transactions' && (
              <div id="panel-transactions" role="tabpanel" aria-labelledby="tab-transactions">
                {showForm && (
                  <TransactionForm
                    newTransaction={newTransaction}
                    setNewTransaction={setNewTransaction}
                    onSubmit={handleSubmit}
                    onSubmitAndContinue={handleSubmitAndContinue}
                    onCancel={handleCloseForm}
                    batchCount={batchCount}
                  />
                )}

                <TransactionsView
                  showForm={showForm}
                  setShowForm={setShowForm}
                  filterCategory={filterCategory}
                  setFilterCategory={setFilterCategory}
                  filterAccount={filterAccount}
                  setFilterAccount={setFilterAccount}
                  loading={transactionsLoading || accountsLoading}
                  onRestore={handleRestoreTransaction}
                />
              </div>
            )}

            {view === 'recurring' && (
              <div id="panel-recurring" role="tabpanel" aria-labelledby="tab-recurring">
                <Suspense fallback={<ViewFallback />}>
                  <RecurringPaymentsView />
                </Suspense>
              </div>
            )}

            {view === 'stats' && (
              <div id="panel-stats" role="tabpanel" aria-labelledby="tab-stats">
                <Suspense fallback={<ViewFallback />}>
                  <StatsView />
                </Suspense>
              </div>
            )}

            {view === 'accounts' && (
              <div id="panel-accounts" role="tabpanel" aria-labelledby="tab-accounts">
                <Suspense fallback={<ViewFallback />}>
                  <AccountsView />
                </Suspense>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI ChatBot */}
      {user && (
        <AIChatBot />
      )}
    </div>
  );
};

export default FinanceTracker;
