'use client';

import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Wallet, CreditCard, Banknote, X } from 'lucide-react';
import type { Account, Transaction, NewAccount } from '../../types/finance';

interface AccountsViewProps {
  accounts: Account[];
  transactions: Transaction[];
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  setDefaultAccount: (id: string) => Promise<void>;
  getAccountBalance: (id: string) => number;
  formatCurrency: (amount: number) => string;
  categories: {
    expense: string[];
    income: string[];
  };
  addCategory: (type: 'expense' | 'income', name: string) => void;
  deleteCategory: (type: 'expense' | 'income', name: string) => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts,
  transactions,
  addAccount,
  updateAccount,
  deleteAccount,
  setDefaultAccount,
  getAccountBalance,
  formatCurrency,
  categories,
  addCategory,
  deleteCategory
}) => {
  // Estados locales movidos desde el componente padre
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  
  const [newAccount, setNewAccount] = useState<NewAccount>({
    name: '',
    type: 'savings',
    initialBalance: 0,
    creditLimit: 0,
    cutoffDay: 1,
    paymentDay: 10
  });
  
  const [newCategory, setNewCategory] = useState<{
    type: 'expense' | 'income';
    name: string;
  }>({
    type: 'expense',
    name: ''
  });

  const accountTypes = [
    { value: 'savings' as const, label: 'Cuenta de Ahorros', icon: Wallet },
    { value: 'credit' as const, label: 'Tarjeta de Crédito', icon: CreditCard },
    { value: 'cash' as const, label: 'Efectivo', icon: Banknote }
  ];

  const getCreditUsed = (accountId: string): number => {
    const account = accounts.find(a => a.id === accountId);
    if (!account || account.type !== 'credit') return 0;

    const accountTx = transactions.filter(t => t.accountId === accountId && t.paid);
    const expenses = accountTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const payments = accountTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    return expenses - payments;
  };

  const getNextCutoffDate = (account: Account): Date | null => {
    if (account.type !== 'credit' || !account.cutoffDay) return null;

    const today = new Date();
    const cutoffDay = account.cutoffDay;
    const cutoffDate = new Date(today.getFullYear(), today.getMonth(), cutoffDay);

    if (today.getDate() >= cutoffDay) {
      cutoffDate.setMonth(cutoffDate.getMonth() + 1);
    }

    return cutoffDate;
  };

  const getNextPaymentDate = (account: Account): Date | null => {
    if (account.type !== 'credit' || !account.paymentDay) return null;

    const today = new Date();
    const paymentDay = account.paymentDay;
    const paymentDate = new Date(today.getFullYear(), today.getMonth(), paymentDay);

    if (today.getDate() >= paymentDay) {
      paymentDate.setMonth(paymentDate.getMonth() + 1);
    }

    return paymentDate;
  };

  const addOrUpdateAccount = async (): Promise<void> => {
    if (!newAccount.name.trim()) {
      alert('⚠️ El nombre de la cuenta no puede estar vacío');
      return;
    }

    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id!, { name: newAccount.name.trim() });
        setEditingAccount(null);
      } else {
        if (newAccount.type === 'credit') {
          const creditLimit = parseFloat(newAccount.creditLimit.toString());
          if (!newAccount.creditLimit || isNaN(creditLimit) || creditLimit <= 0) {
            alert('⚠️ El cupo total debe ser mayor a 0 para tarjetas de crédito');
            return;
          }

          const cutoffDay = parseInt(newAccount.cutoffDay.toString());
          const paymentDay = parseInt(newAccount.paymentDay.toString());

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
          const initialBalance = parseFloat(newAccount.initialBalance.toString());
          if (newAccount.initialBalance && isNaN(initialBalance)) {
            alert('⚠️ El saldo inicial debe ser un número válido');
            return;
          }
        }

        await addAccount({
          name: newAccount.name.trim(),
          type: newAccount.type,
          isDefault: false,
          initialBalance: parseFloat(newAccount.initialBalance.toString()) || 0,
          creditLimit: parseFloat(newAccount.creditLimit.toString()) || 0,
          cutoffDay: parseInt(newAccount.cutoffDay.toString()) || 1,
          paymentDay: parseInt(newAccount.paymentDay.toString()) || 10
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

  const editAccount = (account: Account): void => {
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

  const handleAddCategory = (): void => {
    try {
      addCategory(newCategory.type, newCategory.name);
      setNewCategory({ type: 'expense', name: '' });
      setShowCategoryForm(false);
    } catch (error) {
      alert(`⚠️ ${(error as Error).message}`);
    }
  };

  return (
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
                    onChange={(e) => setNewAccount({...newAccount, type: e.target.value as 'savings' | 'credit' | 'cash'})}
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
                      onChange={(e) => setNewAccount({...newAccount, initialBalance: parseFloat(e.target.value) || 0})}
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
                        onChange={(e) => setNewAccount({...newAccount, creditLimit: parseFloat(e.target.value) || 0})}
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
                onChange={(e) => setNewCategory({...newCategory, type: e.target.value as 'expense' | 'income'})}
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
          const balance = getAccountBalance(account.id!);
          const creditUsed = getCreditUsed(account.id!);
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
                          {formatCurrency(creditUsed)} / {formatCurrency(account.creditLimit!)}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-purple-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            creditUsed > (account.creditLimit || 0) * 0.8 ? 'bg-rose-500' : 'bg-purple-600'
                          }`}
                          style={{ width: `${Math.min((creditUsed / account.creditLimit!) * 100, 100)}%` }}
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
                          onClick={() => setDefaultAccount(account.id!)}
                          className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                        >
                          Principal
                        </button>
                        <button
                          onClick={() => deleteAccount(account.id!)}
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
  );
};