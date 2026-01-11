'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { PlusCircle, TrendingUp, TrendingDown, Calendar, Wallet, Plus, Trash2, Edit2, CreditCard, Banknote, X, BarChart3, PieChart as PieChartIcon, Activity, Copy } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { ThemeToggle } from './src/components/ThemeToggle';
import { StatsCards } from './src/components/StatsCards';
import { TransactionForm } from './src/components/TransactionForm';
import { useTransactions } from './src/hooks/useTransactions';
import { useAccounts } from './src/hooks/useAccounts';
import { useCategories } from './src/hooks/useCategories';
import { useStats } from './src/hooks/useStats';
import { migrateFromLocalStorage } from './src/db/migration';
import type { NewTransaction, NewAccount, ViewType, FilterValue } from './src/types/finance';

const FinanceTracker = () => {
  // Migración automática al iniciar
  useEffect(() => {
    migrateFromLocalStorage().catch(console.error);
  }, []);

  // Hooks personalizados
  const { transactions, addTransaction, deleteTransaction, togglePaid, duplicateTransaction, stats } = useTransactions();
  const { accounts, addAccount, updateAccount, deleteAccount, setDefaultAccount, getAccountBalance, totalBalance, defaultAccount } = useAccounts(transactions);
  const { categories, addCategory, deleteCategory } = useCategories(transactions);
  const { monthlyData, yearlyData, categoryData } = useStats(transactions);

  // Estados locales de UI
  const [showForm, setShowForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
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
  
  const [newAccount, setNewAccount] = useState<NewAccount>({
    name: '',
    type: 'savings',
    initialBalance: 0,
    creditLimit: 0,
    cutoffDay: 1,
    paymentDay: 10
  });
  
  const [newCategory, setNewCategory] = useState({
    type: 'expense' as 'expense' | 'income',
    name: ''
  });

  const accountTypes = [
    { value: 'savings', label: 'Cuenta de Ahorros', icon: Wallet },
    { value: 'credit', label: 'Tarjeta de Crédito', icon: CreditCard },
    { value: 'cash', label: 'Efectivo', icon: Banknote }
  ];

  const handleAddTransaction = async () => {
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
        type: newTransaction.type as any,
        amount: amount,
        category: newTransaction.type === 'transfer' ? 'Transferencia' : newTransaction.category,
        description: newTransaction.description.trim(),
        date: new Date(newTransaction.date),
        paid: newTransaction.paid,
        accountId: parseInt(newTransaction.accountId) || defaultAccount?.id || 0,
        toAccountId: newTransaction.toAccountId ? parseInt(newTransaction.toAccountId) : undefined
      });

      setNewTransaction({
        type: 'expense',
        amount: '',
        category: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        paid: false,
        accountId: defaultAccount?.id?.toString() || '',
        toAccountId: ''
      });
      setShowForm(false);
    } catch (error) {
      alert('❌ Error al agregar transacción');
      console.error(error);
    }
  };

  const addOrUpdateAccount = async () => {
    if (!newAccount.name.trim()) {
      alert('⚠️ El nombre de la cuenta no puede estar vacío');
      return;
    }

    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id, { name: newAccount.name.trim() });
        setEditingAccount(null);
      } else {
        if (newAccount.type === 'credit') {
          const creditLimit = parseFloat(newAccount.creditLimit);
          if (!newAccount.creditLimit || isNaN(creditLimit) || creditLimit <= 0) {
            alert('⚠️ El cupo total debe ser mayor a 0 para tarjetas de crédito');
            return;
          }

          const cutoffDay = parseInt(newAccount.cutoffDay);
          const paymentDay = parseInt(newAccount.paymentDay);

          if (cutoffDay < 1 || cutoffDay > 31) {
            alert('⚠️ El día de corte debe estar entre 1 y 31');
            return;
          }

          if (paymentDay < 1 || paymentDay > 31) {
            alert('⚠️ El día de pago debe estar entre 1 y 31');
            return;
          }

          if (paymentDay <= cutoffDay) {
            alert('⚠️ El día de pago debe ser posterior al día de corte');
            return;
          }
        } else {
          const initialBalance = parseFloat(newAccount.initialBalance);
          if (newAccount.initialBalance && isNaN(initialBalance)) {
            alert('⚠️ El saldo inicial debe ser un número válido');
            return;
          }
        }

        await addAccount({
          name: newAccount.name.trim(),
          type: newAccount.type,
          initialBalance: parseFloat(newAccount.initialBalance) || 0,
          creditLimit: parseFloat(newAccount.creditLimit) || 0,
          cutoffDay: parseInt(newAccount.cutoffDay) || 1,
          paymentDay: parseInt(newAccount.paymentDay) || 10
        });
      }

      setNewAccount({
        name: '',
        type: 'savings',
        initialBalance: 0,
        creditLimit: 0,
        cutoffDay: 1,
        paymentDay: 10
      });
      setShowAccountForm(false);
    } catch (error) {
      alert('❌ Error al guardar cuenta');
      console.error(error);
    }
  };

  const editAccount = (account) => {
    setEditingAccount(account);
    setNewAccount({
      name: account.name,
      type: account.type,
      initialBalance: account.initialBalance,
      creditLimit: account.creditLimit || 0,
      cutoffDay: account.cutoffDay || 1,
      paymentDay: account.paymentDay || 10
    });
    setShowAccountForm(true);
  };



  const handleAddCategory = () => {
    try {
      addCategory(newCategory.type, newCategory.name);
      setNewCategory({ type: 'expense', name: '' });
      setShowCategoryForm(false);
    } catch (error) {
      alert(`⚠️ ${error.message}`);
    }
  };



  const handleDuplicateTransaction = async (transaction) => {
    try {
      await duplicateTransaction(transaction);
      setShowForm(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      alert('❌ Error al duplicar transacción');
      console.error(error);
    }
  };

  const getCreditUsed = (accountId) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account || account.type !== 'credit') return 0;

    const accountTx = transactions.filter(t => t.accountId === accountId && t.paid);
    const expenses = accountTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const payments = accountTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    return expenses - payments;
  };

  const getNextCutoffDate = (account) => {
    if (account.type !== 'credit') return null;

    const today = new Date();
    const cutoffDate = new Date(today.getFullYear(), today.getMonth(), account.cutoffDay);

    if (today.getDate() >= account.cutoffDay) {
      cutoffDate.setMonth(cutoffDate.getMonth() + 1);
    }

    return cutoffDate;
  };

  const getNextPaymentDate = (account) => {
    if (account.type !== 'credit') return null;

    const today = new Date();
    const paymentDate = new Date(today.getFullYear(), today.getMonth(), account.paymentDay);

    if (today.getDate() >= account.paymentDay) {
      paymentDate.setMonth(paymentDate.getMonth() + 1);
    }

    return paymentDate;
  };

  const filteredTransactions = transactions.filter(t => {
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    if (filterStatus === 'paid' && !t.paid) return false;
    if (filterStatus === 'pending' && t.paid) return false;
    if (filterAccount !== 'all' && t.accountId !== parseInt(filterAccount)) return false;
    return true;
  });





  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Funciones de Backup
  const exportData = () => {
    const data = {
      transactions,
      accounts,
      categories,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moneytrack_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        // Validación de estructura
        if (!data || typeof data !== 'object') {
          throw new Error('Formato de archivo inválido');
        }
        
        // Validar transacciones
        if (data.transactions) {
          if (!Array.isArray(data.transactions)) {
            throw new Error('Las transacciones deben ser un array');
          }
          
          const invalidTx = data.transactions.find(t => 
            !t.id || !t.type || typeof t.amount !== 'number' ||
            !['income', 'expense', 'transfer'].includes(t.type)
          );
          
          if (invalidTx) {
            throw new Error('Transacción inválida encontrada');
          }
        }
        
        // Validar cuentas
        if (data.accounts) {
          if (!Array.isArray(data.accounts)) {
            throw new Error('Las cuentas deben ser un array');
          }
          
          const invalidAcc = data.accounts.find(a => 
            !a.id || !a.name || !a.type ||
            !['savings', 'credit', 'cash'].includes(a.type)
          );
          
          if (invalidAcc) {
            throw new Error('Cuenta inválida encontrada');
          }
        }
        
        // Si pasa todas las validaciones, importar
        if (data.transactions) setTransactions(data.transactions);
        if (data.accounts) setAccounts(data.accounts);
        if (data.categories) setCategories(data.categories);
        
        alert('✅ Datos importados correctamente');
      } catch (error) {
        alert(`⚠️ Error al importar: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };

  // Paleta de colores morada
  const COLORS = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#d8b4fe', '#e9d5ff', '#f3e8ff', '#7c3aed', '#6d28d9'];

  // Custom tooltip para los gráficos
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-sm border border-purple-200 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-gray-900 mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background bg-gradient-to-br from-stone-50/50 via-amber-50/30 to-orange-50/20 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header con fondo */}
      <header className="w-full py-4 mb-8 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold mb-2">
                <span className="text-purple-700 dark:text-purple-400">Money</span>
                <span className="text-gray-900 dark:text-gray-100">Track</span>
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Control financiero personal
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Tab Navigation */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex gap-2 border-b border-purple-200">
            {[
              { key: 'transactions', label: 'Transacciones', icon: Activity },
              { key: 'stats', label: 'Estadísticas', icon: BarChart3 },
              { key: 'accounts', label: 'Cuentas', icon: Wallet }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 font-medium transition-all ${
                  view === tab.key
                    ? 'text-purple-600 border-b-2 border-purple-600'
                    : 'text-gray-500 hover:text-purple-500'
                }`}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </div>
          
          {/* Botones de Backup */}
          <div className="flex gap-2">
            <button
              onClick={exportData}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exportar
            </button>
            <input
              type="file"
              accept=".json"
              onChange={importData}
              className="hidden"
              id="import-file"
            />
            <label
              htmlFor="import-file"
              className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Importar
            </label>
          </div>
        </div>

        {/* Stats Cards */}
        <StatsCards
          totalBalance={totalBalance}
          totalIncome={stats.totalIncome}
          totalExpenses={stats.totalExpenses}
          pendingExpenses={stats.pendingExpenses}
          formatCurrency={formatCurrency}
        />

        {/* Transactions View */}
        {view === 'transactions' && (
          <div className="card">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
              <button
                onClick={() => setShowForm(!showForm)}
                className="btn-primary"
              >
                <PlusCircle size={18} />
                Nueva Transacción
              </button>

              <div className="flex gap-3 flex-wrap">
                <select
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  className="select-filter"
                >
                  <option value="all">Todas las cuentas</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>

                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="select-filter"
                >
                  <option value="all">Todas las categorías</option>
                  {[...categories.expense, ...categories.income].map((cat, index) => (
                    <option key={`${cat}-${index}`} value={cat}>{cat}</option>
                  ))}
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="select-filter"
                >
                  <option value="all">Todos</option>
                  <option value="paid">Pagados</option>
                  <option value="pending">Pendientes</option>
                </select>
              </div>
            </div>

            {showForm && (
              <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-5 mb-6 border border-purple-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Nueva Transacción</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="label-base">Cuenta</label>
                    <select
                      value={newTransaction.accountId}
                      onChange={(e) => setNewTransaction({...newTransaction, accountId: parseInt(e.target.value)})}
                      className="input-base"
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} {acc.isDefault ? '(Por defecto)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label-base">Tipo</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setNewTransaction({...newTransaction, type: 'expense', category: '', toAccountId: ''})}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          newTransaction.type === 'expense'
                            ? 'bg-rose-100 text-rose-700 border-2 border-rose-300'
                            : 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        Gasto
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewTransaction({...newTransaction, type: 'income', category: '', toAccountId: ''})}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          newTransaction.type === 'income'
                            ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-300'
                            : 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        Ingreso
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewTransaction({...newTransaction, type: 'transfer', category: 'Transferencia', toAccountId: ''})}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          newTransaction.type === 'transfer'
                            ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                            : 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        Transferencia
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="label-base">Monto</label>
                    <input
                      type="number"
                      value={newTransaction.amount}
                      onChange={(e) => setNewTransaction({...newTransaction, amount: e.target.value})}
                      placeholder="0"
                      className="input-base"
                    />
                  </div>

                  <div>
                    <label className="label-base">
                      {newTransaction.type === 'transfer' ? 'Cuenta Destino' : 'Categoría'}
                    </label>
                    {newTransaction.type === 'transfer' ? (
                      <select
                        value={newTransaction.toAccountId}
                        onChange={(e) => setNewTransaction({...newTransaction, toAccountId: e.target.value})}
                        className="input-base"
                      >
                        <option value="">Seleccionar cuenta destino...</option>
                        {accounts
                          .filter(acc => acc.id !== parseInt(newTransaction.accountId))
                          .map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                          ))}
                      </select>
                    ) : (
                      <select
                        value={newTransaction.category}
                        onChange={(e) => setNewTransaction({...newTransaction, category: e.target.value})}
                        className="input-base"
                      >
                        <option value="">Seleccionar...</option>
                        {categories[newTransaction.type].map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="label-base">Fecha</label>
                    <input
                      type="date"
                      value={newTransaction.date}
                      onChange={(e) => setNewTransaction({...newTransaction, date: e.target.value})}
                      className="input-base"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block mb-1.5 text-sm font-medium text-gray-700">Descripción</label>
                  <input
                    type="text"
                    value={newTransaction.description}
                    onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
                    placeholder="Ej: Compra en supermercado"
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleAddTransaction}
                    className="btn-submit"
                  >
                    Agregar
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    className="btn-cancel"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
                Transacciones ({filteredTransactions.length})
              </h3>

              {filteredTransactions.length === 0 ? (
                <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                  <Activity size={48} className="mx-auto mb-3 opacity-30" />
                  <p>No hay transacciones</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTransactions.map(transaction => {
                    const account = accounts.find(a => a.id === transaction.accountId);
                    return (
                      <div
                        key={transaction.id}
                        className={`border rounded-lg p-4 flex justify-between items-center transition-all ${
                          transaction.paid
                            ? 'bg-white dark:bg-gray-800 border-purple-100 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md'
                            : 'bg-purple-50/50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700'
                        }`}
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <input
                            type="checkbox"
                            checked={transaction.paid}
                            onChange={() => togglePaid(transaction.id)}
                            className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                          />

                          <div className="flex-1">
                            <div className={`font-medium text-gray-900 dark:text-gray-100 ${transaction.paid ? 'line-through opacity-60' : ''}`}>
                              {transaction.description}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                              {transaction.category} • {account?.name} • {new Date(transaction.date).toLocaleDateString('es-CO')}
                            </div>
                          </div>

                          <div className={`text-lg font-semibold ${
                            transaction.type === 'income' ? 'text-emerald-600' : 
                            transaction.type === 'expense' ? 'text-rose-600' : 'text-blue-600'
                          }`}>
                            {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '→'} {formatCurrency(transaction.amount)}
                          </div>

                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDuplicateTransaction(transaction)}
                              className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                              title="Duplicar transacción"
                            >
                              <Copy size={16} />
                            </button>
                            <button
                              onClick={() => deleteTransaction(transaction.id)}
                              className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats View */}
        {view === 'stats' && (
          <div className="space-y-6">
            {/* Flujo de caja */}
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Flujo de Caja</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Últimos 6 meses</p>
                </div>
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Activity size={20} className="text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3e8ff" />
                  <XAxis
                    dataKey="month"
                    stroke="#9ca3af"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    style={{ fontSize: '12px' }}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ paddingTop: '20px' }}
                    iconType="circle"
                  />
                  <Area
                    type="monotone"
                    dataKey="ingresos"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorIngresos)"
                    name="Ingresos"
                  />
                  <Area
                    type="monotone"
                    dataKey="gastos"
                    stroke="#f43f5e"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorGastos)"
                    name="Gastos"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Comparación Mensual */}
              <div className="card">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Comparación Mensual</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Últimos 6 meses</p>
                  </div>
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <BarChart3 size={20} className="text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3e8ff" />
                    <XAxis
                      dataKey="month"
                      stroke="#9ca3af"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis
                      stroke="#9ca3af"
                      style={{ fontSize: '12px' }}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" />
                    <Bar dataKey="ingresos" fill="#8b5cf6" name="Ingresos" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="gastos" fill="#f43f5e" name="Gastos" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Distribución por categoría */}
              <div className="card">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Gastos por Categoría</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Distribución actual</p>
                  </div>
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <PieChartIcon size={20} className="text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
                {categoryData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-4 space-y-2">
                      {categoryData.slice(0, 5).map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                          </div>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                    <PieChartIcon size={48} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No hay datos de gastos</p>
                  </div>
                )}
              </div>
            </div>

            {/* Tendencia anual */}
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tendencia Anual</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Resumen por año</p>
                </div>
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <TrendingUp size={20} className="text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={yearlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3e8ff" />
                  <XAxis
                    dataKey="año"
                    stroke="#9ca3af"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    style={{ fontSize: '12px' }}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" />
                  <Line
                    type="monotone"
                    dataKey="ingresos"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    dot={{ fill: '#8b5cf6', r: 5 }}
                    name="Ingresos"
                  />
                  <Line
                    type="monotone"
                    dataKey="gastos"
                    stroke="#f43f5e"
                    strokeWidth={3}
                    dot={{ fill: '#f43f5e', r: 5 }}
                    name="Gastos"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Accounts View */}
        {view === 'accounts' && (
          <div className="card">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Cuentas</h3>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setEditingAccount(null);
                    setNewAccount({
                      name: '',
                      type: 'savings',
                      initialBalance: 0,
                      creditLimit: 0,
                      cutoffDay: 1,
                      paymentDay: 10
                    });
                    setShowAccountForm(!showAccountForm);
                  }}
                  className="btn-primary"
                >
                  <Plus size={18} />
                  Nueva Cuenta
                </button>

                <button
                  onClick={() => setShowCategoryForm(!showCategoryForm)}
                  className="btn-secondary"
                >
                  <Plus size={18} />
                  Nueva Categoría
                </button>
              </div>
            </div>

            {showAccountForm && (
              <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-5 mb-6 border border-purple-200">
                <h4 className="text-base font-semibold mb-4 text-gray-900 dark:text-gray-100">
                  {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="label-base">Nombre</label>
                    <input
                      type="text"
                      value={newAccount.name}
                      onChange={(e) => setNewAccount({...newAccount, name: e.target.value})}
                      placeholder="Ej: Banco"
                      className="input-base"
                    />
                  </div>

                  {!editingAccount && (
                    <>
                      <div>
                        <label className="label-base">Tipo</label>
                        <select
                          value={newAccount.type}
                          onChange={(e) => setNewAccount({...newAccount, type: e.target.value})}
                          className="input-base"
                        >
                          {accountTypes.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </div>

                      {newAccount.type !== 'credit' ? (
                        <div>
                          <label className="label-base">Saldo inicial</label>
                          <input
                            type="number"
                            value={newAccount.initialBalance}
                            onChange={(e) => setNewAccount({...newAccount, initialBalance: e.target.value})}
                            placeholder="0"
                            className="input-base"
                          />
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="label-base">Cupo total</label>
                            <input
                              type="number"
                              value={newAccount.creditLimit}
                              onChange={(e) => setNewAccount({...newAccount, creditLimit: e.target.value})}
                              placeholder="0"
                              className="input-base"
                            />
                          </div>

                          <div>
                            <label className="label-base">Día de corte</label>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              value={newAccount.cutoffDay}
                              onChange={(e) => setNewAccount({...newAccount, cutoffDay: parseInt(e.target.value)})}
                              className="input-base"
                            />
                          </div>

                          <div>
                            <label className="label-base">Día de pago</label>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              value={newAccount.paymentDay}
                              onChange={(e) => setNewAccount({...newAccount, paymentDay: parseInt(e.target.value)})}
                              className="input-base"
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={addOrUpdateAccount}
                    className="btn-submit"
                  >
                    {editingAccount ? 'Actualizar' : 'Crear'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAccountForm(false);
                      setEditingAccount(null);
                      setNewAccount({
                        name: '',
                        type: 'savings',
                        initialBalance: 0,
                        creditLimit: 0,
                        cutoffDay: 1,
                        paymentDay: 10
                      });
                    }}
                    className="btn-cancel"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {showCategoryForm && (
              <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-5 mb-6 border border-purple-200">
                <h4 className="text-base font-semibold mb-4 text-gray-900 dark:text-gray-100">Nueva Categoría</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label-base">Tipo</label>
                    <select
                      value={newCategory.type}
                      onChange={(e) => setNewCategory({...newCategory, type: e.target.value})}
                      className="input-base"
                    >
                      <option value="expense">Gasto</option>
                      <option value="income">Ingreso</option>
                    </select>
                  </div>

                  <div>
                    <label className="label-base">Nombre</label>
                    <input
                      type="text"
                      value={newCategory.name}
                      onChange={(e) => setNewCategory({...newCategory, name: e.target.value})}
                      placeholder="Ej: Suscripciones"
                      className="input-base"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleAddCategory}
                    className="btn-submit"
                  >
                    Crear
                  </button>
                  <button
                    onClick={() => setShowCategoryForm(false)}
                    className="btn-cancel"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {accounts.map(account => {
                const balance = getAccountBalance(account.id);
                const creditUsed = getCreditUsed(account.id);
                const nextCutoff = getNextCutoffDate(account);
                const nextPayment = getNextPaymentDate(account);
                const accountTypeInfo = accountTypes.find(t => t.value === account.type);

                return (
                  <div
                    key={account.id}
                    className={`rounded-xl p-5 transition-all ${
                      account.isDefault
                        ? 'border-2 border-purple-500 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 shadow-md'
                        : 'border border-purple-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {accountTypeInfo && React.createElement(accountTypeInfo.icon, {
                            size: 20,
                            className: "text-purple-600 dark:text-purple-400"
                          })}
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                              {account.name}
                            </h4>
                            {account.isDefault && (
                              <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full font-medium">
                                Principal
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {accountTypeInfo?.label}
                        </p>

                        {account.type === 'credit' ? (
                          <div className="mt-3">
                            <div className="flex justify-between text-sm mb-1.5">
                              <span className="text-gray-600 dark:text-gray-400">Cupo utilizado</span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {formatCurrency(creditUsed)} / {formatCurrency(account.creditLimit)}
                              </span>
                            </div>
                            <div className="w-full h-2 bg-purple-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  creditUsed > account.creditLimit * 0.8 ? 'bg-rose-500' : 'bg-purple-600'
                                }`}
                                style={{ width: `${Math.min((creditUsed / account.creditLimit) * 100, 100)}%` }}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-3">
                              <div className="text-sm">
                                <div className="text-gray-500 dark:text-gray-400">Corte</div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                  {nextCutoff?.toLocaleDateString('es-CO')}
                                </div>
                              </div>
                              <div className="text-sm">
                                <div className="text-gray-500 dark:text-gray-400">Pago</div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                  {nextPayment?.toLocaleDateString('es-CO')}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                            Saldo inicial: {formatCurrency(account.initialBalance)}
                          </p>
                        )}
                      </div>

                      <div className="text-right ml-6">
                        <div className={`text-2xl font-bold mb-3 ${
                          account.type === 'credit'
                            ? (balance >= 0 ? 'text-purple-600' : 'text-rose-600')
                            : (balance >= 0 ? 'text-purple-600' : 'text-rose-600')
                        }`}>
                          {account.type === 'credit' && (
                            <div className="text-xs font-normal text-gray-500 mb-1">
                              Disponible
                            </div>
                          )}
                          {formatCurrency(balance)}
                        </div>

                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => editAccount(account)}
                            className="btn-edit"
                          >
                            <Edit2 size={14} />
                            Editar
                          </button>

                          {!account.isDefault && (
                            <>
                              <button
                                onClick={() => setDefaultAccount(account.id)}
                                className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                              >
                                Principal
                              </button>
                              <button
                                onClick={() => deleteAccount(account.id)}
                                className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8">
              <h4 className="text-base font-semibold mb-4 text-gray-900 dark:text-gray-100">Categorías</h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h5 className="text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">Gastos</h5>
                  <div className="space-y-2">
                    {categories.expense.map(cat => (
                      <div
                        key={cat}
                        className="flex justify-between items-center p-2.5 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{cat}</span>
                        {!['Alimentación', 'Transporte', 'Servicios', 'Vivienda', 'Salud', 'Entretenimiento', 'Educación', 'Otros'].includes(cat) && (
                          <button
                            onClick={() => deleteCategory('expense', cat)}
                            className="p-1 text-gray-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">Ingresos</h5>
                  <div className="space-y-2">
                    {categories.income.map(cat => (
                      <div
                        key={cat}
                        className="flex justify-between items-center p-2.5 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{cat}</span>
                        {!['Salario', 'Freelance', 'Inversiones', 'Otros'].includes(cat) && (
                          <button
                            onClick={() => deleteCategory('income', cat)}
                            className="p-1 text-gray-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinanceTracker;
