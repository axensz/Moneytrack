'use client';

import React, { useState, useEffect } from 'react';
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
import type { NewTransaction, ViewType, FilterValue, Transaction } from './src/types/finance';

const FinanceTracker = () => {
  useEffect(() => {
    migrateFromLocalStorage().catch(console.error);
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
    type: 'expense',
    amount: '',
    category: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    paid: false,
    accountId: '',
    toAccountId: ''
  });

  const handleAddTransaction = async (): Promise<void> => {
    if (!newTransaction.description.trim()) {
      alert('⚠️ La descripción no puede estar vacía');
      return;
    }

    if (newTransaction.type !== 'transfer' && !newTransaction.category) {
      alert('⚠️ Debes seleccionar una categoría');
      return;
    }

    if (newTransaction.type === 'transfer' && !newTransaction.toAccountId) {
      alert('⚠️ Debes seleccionar una cuenta destino');
      return;
    }

    if (newTransaction.type === 'transfer' && newTransaction.accountId === newTransaction.toAccountId) {
      alert('⚠️ No puedes transferir a la misma cuenta');
      return;
    }

    const amount = parseFloat(newTransaction.amount);
    if (!newTransaction.amount || isNaN(amount) || amount <= 0) {
      alert('⚠️ El monto debe ser mayor a 0');
      return;
    }

    try {
      await addTransaction({
        type: newTransaction.type,
        amount: amount,
        category: newTransaction.type === 'transfer' ? 'Transferencia' : newTransaction.category,
        description: newTransaction.description.trim(),
        date: new Date(newTransaction.date),
        paid: newTransaction.paid,
        accountId: newTransaction.accountId || defaultAccount?.id || '',
        toAccountId: newTransaction.toAccountId || undefined
      });

      setNewTransaction({
        type: 'expense',
        amount: '',
        category: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        paid: false,
        accountId: defaultAccount?.id || '',
        toAccountId: ''
      });
      setShowForm(false);
    } catch (error) {
      alert('❌ Error al agregar transacción');
      console.error(error);
    }
  };

  const handleDuplicateTransaction = async (transaction: Transaction): Promise<void> => {
    try {
      await duplicateTransaction(transaction);
      setShowForm(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      alert('❌ Error al duplicar transacción');
      console.error(error);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-background bg-gradient-to-br from-stone-50/50 via-amber-50/30 to-orange-50/20 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />

      <Header 
        user={user}
        isAuthModalOpen={isAuthModalOpen}
        setIsAuthModalOpen={setIsAuthModalOpen}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <TabNavigation 
          view={view}
          setView={setView}
          exportData={exportData}
          importData={importData}
        />

        <StatsCards
          totalBalance={totalBalance}
          totalIncome={stats.totalIncome}
          totalExpenses={stats.totalExpenses}
          pendingExpenses={stats.pendingExpenses}
          formatCurrency={formatCurrency}
        />

        {view === 'transactions' && (
          <>
            {showForm && (
              <TransactionForm
                newTransaction={newTransaction}
                setNewTransaction={setNewTransaction}
                accounts={accounts}
                categories={categories}
                defaultAccount={defaultAccount || null}
                onSubmit={handleAddTransaction}
                onCancel={() => setShowForm(false)}
              />
            )}
            
            <TransactionsView
              transactions={transactions}
              accounts={accounts}
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
            monthlyData={monthlyData}
            yearlyData={yearlyData}
            categoryData={categoryData}
            formatCurrency={formatCurrency}
          />
        )}

        {view === 'accounts' && (
          <AccountsView
            accounts={accounts}
            transactions={transactions}
            addAccount={addAccount}
            updateAccount={updateAccount}
            deleteAccount={deleteAccount}
            setDefaultAccount={setDefaultAccount}
            getAccountBalance={getAccountBalance}
            formatCurrency={formatCurrency}
            categories={categories}
            addCategory={addCategory}
            deleteCategory={deleteCategory}
          />
        )}
      </div>
    </div>
  );
};

export default FinanceTracker;