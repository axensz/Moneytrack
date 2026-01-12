'use client';

import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Header } from './src/components/Header';
import { TabNavigation } from './src/components/TabNavigation';
import { StatsCards } from './src/components/StatsCards';
import { TransactionForm } from './src/components/TransactionForm';
import { AuthModal } from './src/components/AuthModal';
import { StatsView } from './src/components/views/StatsView';
import { AccountsView } from './src/components/views/AccountsView';
import { TransactionsView } from './src/components/views/TransactionsView';
import { useTransactions } from './src/hooks/useTransactions';
import { useAccounts } from './src/hooks/useAccounts';
import { useCategories } from './src/hooks/useCategories';
import { useStats } from './src/hooks/useStats';
import { useAuth } from './src/hooks/useAuth';
import { useBackup } from './src/hooks/useBackup';
import { migrateFromLocalStorage } from './src/db/migration';
import { TransactionValidator } from './src/utils/validators';
import { formatCurrency } from './src/utils/formatters';
import { SUCCESS_MESSAGES, ERROR_MESSAGES, TRANSFER_CATEGORY, TOAST_CONFIG, INITIAL_TRANSACTION } from './src/config/constants';
import type { NewTransaction, ViewType, FilterValue, Transaction } from './src/types/finance';

const FinanceTracker = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    migrateFromLocalStorage().catch(console.error);
    setMounted(true);
  }, []);

  const { user } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const { transactions, addTransaction, deleteTransaction, togglePaid, duplicateTransaction, stats, loading: transactionsLoading } = useTransactions(user?.uid || null);
  const { accounts, addAccount, updateAccount, deleteAccount, setDefaultAccount, getAccountBalance, totalBalance, defaultAccount, loading: accountsLoading } = useAccounts(user?.uid || null, transactions);
  const { categories, addCategory, deleteCategory } = useCategories(transactions);
  const { monthlyData, yearlyData, categoryData } = useStats(transactions);
  const { exportData, importData } = useBackup({ transactions, accounts, categories });

  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<ViewType>('transactions');
  const [filterCategory, setFilterCategory] = useState<FilterValue>('all');
  const [filterStatus, setFilterStatus] = useState<FilterValue>('all');
  const [filterAccount, setFilterAccount] = useState<FilterValue>('all');
  
  const [newTransaction, setNewTransaction] = useState<NewTransaction>({
    ...INITIAL_TRANSACTION
  });

  const handleAddTransaction = async (): Promise<void> => {
    // Obtener información de la cuenta
    const selectedAccount = accounts.find(acc => acc.id === (newTransaction.accountId || defaultAccount?.id));
    const accountBalance = selectedAccount ? getAccountBalance(selectedAccount.id!) : 0;
    
    // Validar transacción usando el validador centralizado
    const validation = TransactionValidator.validate(
      newTransaction, 
      accountBalance, 
      selectedAccount?.type
    );

    if (!validation.isValid) {
      validation.errors.forEach(error => toast.error(error));
      return;
    }

    try {
      await addTransaction({
        type: newTransaction.type,
        amount: parseFloat(newTransaction.amount),
        category: newTransaction.type === 'transfer' ? TRANSFER_CATEGORY : newTransaction.category,
        description: newTransaction.description.trim(),
        date: new Date(newTransaction.date),
        paid: newTransaction.paid,
        accountId: newTransaction.accountId || defaultAccount?.id || '',
        toAccountId: newTransaction.toAccountId || undefined
      });

      setNewTransaction({
        ...INITIAL_TRANSACTION,
        accountId: defaultAccount?.id || ''
      });
      setShowForm(false);
      toast.success(SUCCESS_MESSAGES.TRANSACTION_ADDED);
    } catch (error) {
      toast.error(ERROR_MESSAGES.ADD_TRANSACTION_ERROR);
      console.error(error);
    }
  };

  const handleDuplicateTransaction = async (transaction: Transaction): Promise<void> => {
    try {
      await duplicateTransaction(transaction);
      setShowForm(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.success(SUCCESS_MESSAGES.TRANSACTION_DUPLICATED);
    } catch (error) {
      toast.error(ERROR_MESSAGES.DUPLICATE_TRANSACTION_ERROR);
      console.error(error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background bg-gradient-to-br from-stone-50/50 via-amber-50/30 to-orange-50/20 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Toaster
        position={TOAST_CONFIG.position}
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

      <Header 
        user={user}
        isAuthModalOpen={isAuthModalOpen}
        setIsAuthModalOpen={setIsAuthModalOpen}
      />

      <div className="flex-1 overflow-auto">
        <div className="w-full h-full px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-7xl mx-auto">
            <TabNavigation 
              view={view}
              setView={setView}
              exportData={exportData}
              importData={importData}
            />

            <StatsCards
              totalBalance={mounted ? totalBalance : 0}
              totalIncome={mounted ? stats.totalIncome : 0}
              totalExpenses={mounted ? stats.totalExpenses : 0}
              pendingExpenses={mounted ? stats.pendingExpenses : 0}
              formatCurrency={formatCurrency}
            />

            {view === 'transactions' && (
              <>
                {showForm && (
                  <TransactionForm
                    newTransaction={newTransaction}
                    setNewTransaction={setNewTransaction}
                    accounts={mounted ? accounts : []}
                    categories={categories}
                    defaultAccount={defaultAccount || null}
                    onSubmit={handleAddTransaction}
                    onCancel={() => setShowForm(false)}
                  />
                )}
                
                <TransactionsView
                  transactions={mounted ? transactions : []}
                  accounts={mounted ? accounts : []}
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
                  handleDuplicateTransaction={handleDuplicateTransaction}
                  formatCurrency={formatCurrency}
                />
              </>
            )}

            {view === 'stats' && (
              <StatsView
                monthlyData={mounted ? monthlyData : []}
                yearlyData={mounted ? yearlyData : []}
                categoryData={mounted ? categoryData : []}
                formatCurrency={formatCurrency}
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