'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Activity, BarChart3, Wallet, Repeat } from 'lucide-react';
import { Header } from './components/layout/Header';
import { TabNavigation } from './components/layout/TabNavigation';
import { LoadingScreen } from './components/layout/LoadingScreen';
import { StatsCards, TransactionForm } from './components/shared';
import { AuthModal } from './components/modals/AuthModal';
import { WelcomeModal } from './components/modals/WelcomeModal';
import { HelpModal } from './components/modals/HelpModal';
import { StatsView } from './components/views/stats';
import { AccountsView } from './components/views/accounts';
import { TransactionsView } from './components/views/transactions';
import { RecurringPaymentsView } from './components/views/recurring';
import { useTransactions } from './hooks/useTransactions';
import { useAccounts } from './hooks/useAccounts';
import { useCategories } from './hooks/useCategories';
import { useAuth } from './hooks/useAuth';
import { useRecurringPayments } from './hooks/useRecurringPayments';
import { useAddTransaction } from './hooks/useAddTransaction';
import { useFilteredData } from './hooks/useFilteredData';
import { useWelcomeModal } from './hooks/useWelcomeModal';
import { useNotifications } from './hooks/useNotifications'; // 🆕 Notificaciones  
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'; // 🆕 Atajos de teclado
import { formatCurrency } from './utils/formatters';
import { TOAST_CONFIG, INITIAL_TRANSACTION } from './config/constants';
import { logger } from './utils/logger';
import type { NewTransaction, ViewType, FilterValue } from './types/finance';
import { logoutFirebase } from './lib/firebase';

const FinanceTracker = () => {
  const [mounted, setMounted] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { user, loading: authLoading } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  // 🟡 REFACTORIZADO: Hook simplificado (ya no calcula stats, solo CRUD)
  const { transactions, addTransaction, deleteTransaction, togglePaid, updateTransaction, loading: transactionsLoading } = useTransactions(user?.uid || null);

  // Cargar cuentas con transacciones
  const { accounts, addAccount, updateAccount, deleteAccount, setDefaultAccount, getAccountBalance, getTransactionCountForAccount, totalBalance, defaultAccount, loading: accountsLoading } = useAccounts(user?.uid || null, transactions, deleteTransaction);

  // 🆕 Hook de pagos periódicos
  const {
    recurringPayments,
    addRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
    isPaidForMonth,
    getNextDueDate,
    getDaysUntilDue,
    getPaymentHistory,
    stats: recurringStats
  } = useRecurringPayments(user?.uid || null, transactions);

  const { categories, addCategory, deleteCategory } = useCategories(transactions, user?.uid);

  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<ViewType>('transactions');
  const [filterCategory, setFilterCategory] = useState<FilterValue>('all');
  const [filterStatus, setFilterStatus] = useState<FilterValue>('all');
  const [filterAccount, setFilterAccount] = useState<FilterValue>('all');
  // 🆕 Estado para filtro de fecha
  const [dateRange, setDateRange] = useState<import('./types/finance').DateRange>({ preset: 'all' });

  // 🆕 Hook para filtrado y estadísticas dinámicas (ahora incluye fecha)
  const { dynamicStats, dynamicTotalBalance, balanceLabel } = useFilteredData({
    transactions,
    accounts,
    filterAccount,
    filterCategory,
    dateRange, // 🆕 Incluir filtro de fecha
    totalBalance,
    getAccountBalance,
  });

  const [newTransaction, setNewTransaction] = useState<NewTransaction>({
    ...INITIAL_TRANSACTION
  });

  // Hook para manejar el modal de bienvenida
  const { showWelcomeModal, handleDismissWelcomeModal, setShowWelcomeModal } = useWelcomeModal({
    mounted,
    authLoading,
    accountsLoading,
    accountsCount: accounts.length,
  });

  // 🆕 Hook de notificaciones
  const { checkAndNotifyPayments } = useNotifications();

  // 🆕 Verificar pagos vencidos al cargar (solo una vez al día)
  useEffect(() => {
    if (!mounted || !recurringPayments.length) return;

    // Verificar si ya revisamos hoy
    const lastCheckDate = localStorage.getItem('lastNotificationCheck');
    const today = new Date().toDateString();
    
    if (lastCheckDate === today) return;

    // Verificar y notificar después de 5 segundos (dar tiempo a cargar)
    const timer = setTimeout(() => {
      checkAndNotifyPayments(recurringPayments, getDaysUntilDue);
      localStorage.setItem('lastNotificationCheck', today);
    }, 5000);

    return () => clearTimeout(timer);
  }, [mounted, recurringPayments, getDaysUntilDue, checkAndNotifyPayments]);

  // 🆕 Atajos de teclado
  useKeyboardShortcuts(
    [
      {
        key: 'n',
        modifiers: ['ctrl'],
        description: 'Nueva transacción',
        action: () => {
          if (accounts.length > 0) {
            setShowForm(true);
            setView('transactions');
          }
        }
      },
      {
        key: '1',
        modifiers: ['alt'],
        description: 'Ir a Transacciones',
        action: () => setView('transactions')
      },
      {
        key: '2',
        modifiers: ['alt'],
        description: 'Ir a Cuentas',
        action: () => setView('accounts')
      },
      {
        key: '3',
        modifiers: ['alt'],
        description: 'Ir a Pagos Periódicos',
        action: () => setView('recurring')
      },
      {
        key: '4',
        modifiers: ['alt'],
        description: 'Ir a Estadísticas',
        action: () => setView('stats')
      },
      {
        key: 'h',
        modifiers: ['ctrl'],
        description: 'Abrir ayuda',
        action: () => setShowHelpModal(true)
      },
      {
        key: 'Escape',
        description: 'Cerrar modal',
        action: () => {
          setShowForm(false);
          setShowHelpModal(false);
          setIsAuthModalOpen(false);
        },
        preventDefault: false // Permitir comportamiento por defecto
      }
    ],
    { enabled: mounted, announceShortcuts: true }
  );

  // 🆕 Hook para manejar la creación de transacciones
  // IMPORTANTE: Debe estar ANTES de cualquier return condicional
  const { handleAddTransaction } = useAddTransaction({
    accounts,
    transactions,
    recurringPayments,
    defaultAccount: defaultAccount || null,
    addTransaction,
    updateRecurringPayment,
    setNewTransaction,
    setShowForm,
    setShowWelcomeModal,
  });

  // Handler para cerrar sesión con pantalla de carga
  const handleLogout = useCallback(async () => {
    try {
      setIsLoggingOut(true);
      await logoutFirebase();
      // Pequeño delay para que se vea la pantalla de cierre de sesión
      await new Promise(resolve => setTimeout(resolve, 800));
      toast.success('Sesión cerrada correctamente');
    } catch (error) {
      logger.error('Error al cerrar sesión', error);
      toast.error('Error al cerrar sesión');
    } finally {
      setIsLoggingOut(false);
    }
  }, []);

  // Handlers optimizados con useCallback
  const handleOpenAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const handleCloseAuthModal = useCallback(() => setIsAuthModalOpen(false), []);
  const handleOpenHelpModal = useCallback(() => setShowHelpModal(true), []);
  const handleCloseHelpModal = useCallback(() => setShowHelpModal(false), []);
  const handleOpenForm = useCallback(() => setShowForm(true), []);
  const handleCloseForm = useCallback(() => setShowForm(false), []);
  const handleRestoreTransaction = useCallback(
    (t: Omit<import('./types/finance').Transaction, 'id' | 'createdAt'>) => addTransaction(t),
    [addTransaction]
  );

  const handleGoToAccounts = useCallback(() => {
    handleDismissWelcomeModal();
    setView('accounts');
  }, [handleDismissWelcomeModal]);

  // Mostrar pantalla de carga mientras verifica autenticación o carga datos
  // IMPORTANTE: Debe estar DESPUÉS de todos los hooks
  // Si hay usuario, esperar a que carguen cuentas Y transacciones
  const isDataLoading = user && (accountsLoading || transactionsLoading);
  const isLoading = !mounted || authLoading || isDataLoading;

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isLoggingOut) {
    return <LoadingScreen message="Cerrando sesión..." variant="logout" />;
  }

  return (
    <div className="flex flex-col h-screen bg-background bg-gradient-to-br from-violet-50/30 via-purple-50/20 to-fuchsia-50/10 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
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

      <Header
        user={user}
        isAuthModalOpen={isAuthModalOpen}
        setIsAuthModalOpen={setIsAuthModalOpen}
        showSettingsMenu={showSettingsMenu}
        setShowSettingsMenu={setShowSettingsMenu}
        onOpenHelp={handleOpenHelpModal}
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
              totalBalance={mounted ? dynamicTotalBalance : 0}
              totalIncome={mounted ? dynamicStats.totalIncome : 0}
              totalExpenses={mounted ? dynamicStats.totalExpenses : 0}
              pendingExpenses={mounted ? dynamicStats.pendingExpenses : 0}
              formatCurrency={formatCurrency}
              balanceLabel={balanceLabel}
            />

            {view === 'transactions' && (
              <>
                {showForm && (
                  <TransactionForm
                    newTransaction={newTransaction}
                    setNewTransaction={setNewTransaction}
                    accounts={mounted ? accounts : []}
                    transactions={mounted ? transactions : []}
                    categories={categories}
                    defaultAccount={defaultAccount || null}
                    recurringPayments={mounted ? recurringPayments : []}
                    onSubmit={() => handleAddTransaction(newTransaction)}
                    onCancel={handleCloseForm}
                  />
                )}

                <TransactionsView
                  transactions={mounted ? transactions : []}
                  accounts={mounted ? accounts : []}
                  recurringPayments={mounted ? recurringPayments : []}
                  showForm={showForm}
                  setShowForm={setShowForm}
                  filterCategory={filterCategory}
                  setFilterCategory={setFilterCategory}
                  filterStatus={filterStatus}
                  setFilterStatus={setFilterStatus}
                  filterAccount={filterAccount}
                  setFilterAccount={setFilterAccount}
                  categories={categories}
                  togglePaid={togglePaid}
                  deleteTransaction={deleteTransaction}
                  updateTransaction={updateTransaction}
                  formatCurrency={formatCurrency}
                  loading={transactionsLoading || accountsLoading}
                  onRestore={handleRestoreTransaction}
                />
              </>
            )}

            {view === 'recurring' && (
              <RecurringPaymentsView
                recurringPayments={mounted ? recurringPayments : []}
                accounts={mounted ? accounts : []}
                transactions={mounted ? transactions : []}
                categories={categories}
                formatCurrency={formatCurrency}
                addRecurringPayment={addRecurringPayment}
                updateRecurringPayment={updateRecurringPayment}
                deleteRecurringPayment={deleteRecurringPayment}
                isPaidForMonth={isPaidForMonth}
                getNextDueDate={getNextDueDate}
                getDaysUntilDue={getDaysUntilDue}
                getPaymentHistory={getPaymentHistory}
                stats={recurringStats}
              />
            )}

            {view === 'stats' && (
              <StatsView
                transactions={mounted ? transactions : []}
                accounts={mounted ? accounts : []}
              />
            )}

            {view === 'accounts' && (
              <AccountsView
                accounts={mounted ? accounts : []}
                transactions={mounted ? transactions : []}
                addAccount={addAccount}
                updateAccount={updateAccount}
                deleteAccount={deleteAccount}
                setDefaultAccount={setDefaultAccount}
                getAccountBalance={getAccountBalance}
                getTransactionCountForAccount={getTransactionCountForAccount}
                formatCurrency={formatCurrency}
                categories={categories}
                addCategory={addCategory}
                deleteCategory={deleteCategory}
                addTransaction={addTransaction}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceTracker;
