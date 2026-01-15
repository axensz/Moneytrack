'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Activity, BarChart3, Wallet, Repeat } from 'lucide-react';
import { Header } from './src/components/Header';
import { TabNavigation } from './src/components/TabNavigation';
import { StatsCards } from './src/components/StatsCards';
import { TransactionForm } from './src/components/TransactionForm';
import { AuthModal } from './src/components/AuthModal';
import { LoadingScreen } from './src/components/LoadingScreen';
import { WelcomeModal } from './src/components/WelcomeModal';
import { HelpModal } from './src/components/HelpModal';
import { StatsView } from './src/components/views/stats';
import { AccountsView } from './src/components/views/accounts';
import { TransactionsView } from './src/components/views/TransactionsView';
import { RecurringPaymentsView } from './src/components/views/recurring';
import { useTransactions } from './src/hooks/useTransactions';
import { useAccounts } from './src/hooks/useAccounts';
import { useCategories } from './src/hooks/useCategories';
import { useAuth } from './src/hooks/useAuth';
import { useBackup } from './src/hooks/useBackup';
import { useGlobalStats } from './src/hooks/useGlobalStats';
import { useRecurringPayments } from './src/hooks/useRecurringPayments';
import { TransactionValidator } from './src/utils/validators';
import { formatCurrency } from './src/utils/formatters';
import { calculateInterest } from './src/utils/interestCalculator';
import { SUCCESS_MESSAGES, ERROR_MESSAGES, TRANSFER_CATEGORY, TOAST_CONFIG, INITIAL_TRANSACTION } from './src/config/constants';
import type { NewTransaction, ViewType, FilterValue, Transaction } from './src/types/finance';
import { logoutFirebase } from './src/lib/firebase';

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

  // 🟡 REFACTORIZADO: Usar hook centralizado de estadísticas (elimina duplicidad)
  const stats = useGlobalStats(transactions, accounts);

  const { categories, addCategory, deleteCategory } = useCategories(transactions);
  const { exportData, importData } = useBackup({ transactions, accounts, categories });

  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<ViewType>('transactions');
  const [filterCategory, setFilterCategory] = useState<FilterValue>('all');
  const [filterStatus, setFilterStatus] = useState<FilterValue>('all');
  const [filterAccount, setFilterAccount] = useState<FilterValue>('all');

  // 🔄 LOGICA DE FILTRADO PARA ESTADISTICAS DINAMICAS
  // Calculamos las transacciones filtradas para que las tarjetas reflejen la vista actual
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // 1. Filtro por Cuenta
      if (filterAccount !== 'all' && t.accountId !== filterAccount) return false;
      // 2. Filtro por Categoría
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      return true;
    });
  }, [transactions, filterAccount, filterCategory]);

  // Filtramos las cuentas solo si hay un filtro de cuenta activo
  // Esto afecta al cálculo de "Gastos Pendientes" (Deuda TC) y al Balance mostrado
  const filteredAccounts = useMemo(() => {
    if (filterAccount === 'all') return accounts;
    return accounts.filter(acc => acc.id === filterAccount);
  }, [accounts, filterAccount]);

  // Usamos el hook de estadísticas con los datos FILTRADOS
  const dynamicStats = useGlobalStats(filteredTransactions, filteredAccounts);

  // Calculamos el balance total dinámico (afectado solo por filtro de cuenta, no de categoría)
  const dynamicTotalBalance = useMemo(() => {
    if (filterAccount === 'all') return totalBalance;
    // Usamos el helper getAccountBalance que ya calcula el saldo usando las estrategias correctas
    // en lugar de intentar acceder a una propiedad .currentBalance que no existe en el objeto Account
    return getAccountBalance(filterAccount);
  }, [totalBalance, filterAccount, getAccountBalance]);

  // Etiqueta dinámica para el balance (UX Improvement)
  const balanceLabel = useMemo(() => {
    if (filterAccount === 'all') return 'Balance Total';
    const account = accounts.find(acc => acc.id === filterAccount);
    if (account?.type === 'credit') return 'Cupo Disponible';
    return 'Balance';
  }, [filterAccount, accounts]);

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

  const handleAddTransaction = async (): Promise<void> => {
    // Validar que existan cuentas
    if (accounts.length === 0) {
      toast.error('Debes crear al menos una cuenta primero');
      setShowWelcomeModal(true);
      return;
    }

    // Obtener información de la cuenta
    const accountId = newTransaction.accountId || defaultAccount?.id;
    const selectedAccount = accounts.find(acc => acc.id === accountId);

    if (!selectedAccount) {
      toast.error('Por favor selecciona una cuenta válida');
      return;
    }

    // 🔵 PASO 4: Validación usando Strategy Pattern
    // Delega la validación de saldo/cupo a la estrategia correspondiente
    const validation = TransactionValidator.validate(
      newTransaction,
      selectedAccount,
      transactions
    );

    if (!validation.isValid) {
      validation.errors.forEach(error => toast.error(error));
      return;
    }

    try {
      // Convertir amount de formato colombiano (1.234,56) a número
      const amountStr = newTransaction.amount.toString().replace(/\./g, '').replace(',', '.');
      const amount = parseFloat(amountStr);

      if (isNaN(amount)) {
        toast.error('Monto inválido');
        return;
      }

      // 🆕 Si es un pago periódico con monto diferente, actualizar el monto base
      if (newTransaction.recurringPaymentId) {
        const recurringPayment = recurringPayments.find(p => p.id === newTransaction.recurringPaymentId);
        if (recurringPayment && recurringPayment.amount !== amount) {
          // Actualizar el monto del pago periódico al monto real pagado
          await updateRecurringPayment(newTransaction.recurringPaymentId, { amount });
        }
      }

      // Preparar datos de la transacción
      const transactionData: Omit<Transaction, 'id' | 'createdAt'> = {
        type: newTransaction.type,
        amount: amount,
        category: newTransaction.type === 'transfer' ? TRANSFER_CATEGORY : newTransaction.category,
        description: newTransaction.description.trim(),
        date: new Date(), // 🆕 Siempre usar fecha actual, no la fecha de vencimiento
        paid: newTransaction.paid,
        accountId: newTransaction.accountId || defaultAccount?.id || '',
        toAccountId: newTransaction.toAccountId || undefined,
        recurringPaymentId: newTransaction.recurringPaymentId || undefined // 🆕 Asociar a pago periódico
      };

      // 🆕 CALCULAR INTERESES: Si es un gasto en TC con cuotas/intereses
      if (
        selectedAccount.type === 'credit' &&
        newTransaction.type === 'expense' &&
        newTransaction.installments &&
        newTransaction.installments > 0
      ) {
        const annualRate = selectedAccount.interestRate || 0;
        const interestResult = calculateInterest(
          amount,
          annualRate,
          newTransaction.installments,
          newTransaction.hasInterest
        );

        // Agregar campos calculados a la transacción
        transactionData.hasInterest = newTransaction.hasInterest;
        transactionData.installments = newTransaction.installments;
        transactionData.monthlyInstallmentAmount = interestResult.monthlyInstallmentAmount;
        transactionData.totalInterestAmount = interestResult.totalInterestAmount;
        transactionData.interestRate = annualRate; // Snapshot de la tasa
      }

      // ⚡ CERRAR MODAL INMEDIATAMENTE (UX optimizada)
      setNewTransaction({
        ...INITIAL_TRANSACTION,
        accountId: defaultAccount?.id || ''
      });
      setShowForm(false);

      // Ejecutar operación asíncrona después del cierre
      await addTransaction(transactionData);
      toast.success(SUCCESS_MESSAGES.TRANSACTION_ADDED);
    } catch (error) {
      toast.error(ERROR_MESSAGES.ADD_TRANSACTION_ERROR);
      console.error(error);
    }
  };

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
                    onSubmit={handleAddTransaction}
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