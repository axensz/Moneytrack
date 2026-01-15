'use client';

import React, { useState, useEffect, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Activity, BarChart3, Wallet, Repeat } from 'lucide-react';
import { Header } from './components/Header';
import { TabNavigation } from './components/TabNavigation';
import { StatsCards } from './components/StatsCards';
import { TransactionForm } from './components/TransactionForm';
import { AuthModal } from './components/AuthModal';
import { LoadingScreen } from './components/LoadingScreen';
import { WelcomeModal } from './components/WelcomeModal';
import { HelpModal } from './components/HelpModal';
import { StatsView } from './components/views/stats';
import { AccountsView } from './components/views/accounts';
import { TransactionsView } from './components/views/transactions';
import { RecurringPaymentsView } from './components/views/recurring';
import { useTransactions } from './hooks/useTransactions';
import { useAccounts } from './hooks/useAccounts';
import { useCategories } from './hooks/useCategories';
import { useAuth } from './hooks/useAuth';
import { useBackup } from './hooks/useBackup';
import { useRecurringPayments } from './hooks/useRecurringPayments';
import { useAddTransaction } from './hooks/useAddTransaction';
import { useFilteredData } from './hooks/useFilteredData';
import { formatCurrency } from './utils/formatters';
import { TOAST_CONFIG, INITIAL_TRANSACTION } from './config/constants';
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
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
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

  const { categories, addCategory, deleteCategory } = useCategories(transactions);
  const { exportData, importData } = useBackup({ transactions, accounts, categories });

  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<ViewType>('transactions');
  const [filterCategory, setFilterCategory] = useState<FilterValue>('all');
  const [filterStatus, setFilterStatus] = useState<FilterValue>('all');
  const [filterAccount, setFilterAccount] = useState<FilterValue>('all');

  // 🆕 Hook para filtrado y estadísticas dinámicas
  const { dynamicStats, dynamicTotalBalance, balanceLabel } = useFilteredData({
    transactions,
    accounts,
    filterAccount,
    filterCategory,
    totalBalance,
    getAccountBalance,
  });

  const [newTransaction, setNewTransaction] = useState<NewTransaction>({
    ...INITIAL_TRANSACTION
  });

  // Mostrar modal de bienvenida si no hay cuentas
  // Esperar a que termine la autenticación Y la carga de cuentas
  const shouldShowWelcome = mounted && !authLoading && !accountsLoading && accounts.length === 0;
  
  useEffect(() => {
    if (shouldShowWelcome) {
      setShowWelcomeModal(true);
    }
  }, [shouldShowWelcome]);

  // Handler para cerrar sesión con pantalla de carga
  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logoutFirebase();
      // Pequeño delay para que se vea la pantalla de cierre de sesión
      await new Promise(resolve => setTimeout(resolve, 800));
      toast.success('Sesión cerrada correctamente');
    } catch (error) {
      console.error('Error al cerrar sesión', error);
      toast.error('Error al cerrar sesión');
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Mostrar pantalla de carga mientras verifica autenticación o cierra sesión
  // IMPORTANTE: Debe estar DESPUÉS de todos los hooks
  if (authLoading || !mounted) {
    return <LoadingScreen />;
  }
  
  if (isLoggingOut) {
    return <LoadingScreen message="Cerrando sesión..." variant="logout" />;
  }

  const handleGoToAccounts = () => {
    setShowWelcomeModal(false);
    setView('accounts');
  };

  // 🆕 Hook para manejar la creación de transacciones
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

  return (
    <div className="flex flex-col h-screen bg-background bg-gradient-to-br from-violet-50/30 via-purple-50/20 to-fuchsia-50/10 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Mobile Bottom Navigation - Fixed at bottom, FUERA del contenedor scrollable */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 shadow-lg safe-area-bottom">
        <div className="flex justify-around items-center px-2 py-2 pb-2">
          {[
            { key: 'transactions' as ViewType, label: 'Transacciones', icon: Activity },
            { key: 'accounts' as ViewType, label: 'Cuentas', icon: Wallet },
            { key: 'recurring' as ViewType, label: 'Periódicos', icon: Repeat },
            { key: 'stats' as ViewType, label: 'Estadísticas', icon: BarChart3 }
          ].map(tab => (
            <button
              key={tab.key}
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
              <tab.icon size={22} strokeWidth={view === tab.key ? 2.5 : 2} />
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
        onClose={() => setIsAuthModalOpen(false)} 
      />

      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        onGoToAccounts={handleGoToAccounts}
      />

      <HelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />

      <Header 
        user={user}
        isAuthModalOpen={isAuthModalOpen}
        setIsAuthModalOpen={setIsAuthModalOpen}
        showSettingsMenu={showSettingsMenu}
        setShowSettingsMenu={setShowSettingsMenu}
        onOpenHelp={() => setShowHelpModal(true)}
        onLogout={handleLogout}
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 pb-24 sm:pb-6">
          <div className="max-w-7xl mx-auto">
            <TabNavigation 
              view={view}
              setView={setView}
              exportData={exportData}
              importData={importData}
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
                    onCancel={() => setShowForm(false)}
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
                  onRestore={(t) => addTransaction(t)}
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