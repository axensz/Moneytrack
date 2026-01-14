'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Edit2, Trash2, Wallet, CreditCard, Banknote, X, GripVertical } from 'lucide-react';
import { showToast } from '../../utils/toastHelpers';
import { formatNumberForInput, unformatNumber } from '../../utils/formatters';
import { BalanceCalculator } from '../../utils/balanceCalculator';
import { PROTECTED_CATEGORIES, ERROR_MESSAGES, SUCCESS_MESSAGES } from '../../config/constants';
import type { Account, Transaction, NewAccount } from '../../types/finance';

interface AccountsViewProps {
  accounts: Account[];
  transactions: Transaction[];
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  setDefaultAccount: (id: string) => Promise<void>;
  getAccountBalance: (id: string) => number;
  getTransactionCountForAccount: (id: string) => number;
  formatCurrency: (amount: number) => string;
  categories: {
    expense: string[];
    income: string[];
  };
  addCategory: (type: 'expense' | 'income', name: string) => void;
  deleteCategory: (type: 'expense' | 'income', name: string) => void;
  addTransaction: (transaction: Omit<Transaction, 'id'>) => Promise<void>;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts,
  transactions,
  addAccount,
  updateAccount,
  deleteAccount,
  setDefaultAccount,
  getAccountBalance,
  getTransactionCountForAccount,
  formatCurrency,
  categories,
  addCategory,
  deleteCategory,
  addTransaction
}) => {
  // Estados locales movidos desde el componente padre
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [confirmDeleteWithTransactions, setConfirmDeleteWithTransactions] = useState(false);
  
  const [newAccount, setNewAccount] = useState<NewAccount>({
    name: '',
    type: 'savings',
    initialBalance: 0,
    creditLimit: 0,
    cutoffDay: 1,
    paymentDay: 10,
    bankAccountId: undefined,
    interestRate: 0
  });
  
  const [newCategory, setNewCategory] = useState<{
    type: 'expense' | 'income';
    name: string;
  }>({
    type: 'expense',
    name: ''
  });

  const [balanceAdjustment, setBalanceAdjustment] = useState<string>('');
  const [draggedAccountId, setDraggedAccountId] = useState<string | null>(null);
  const [dragOverAccountId, setDragOverAccountId] = useState<string | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchCurrentY, setTouchCurrentY] = useState<number | null>(null);

  // Estados temporales para formateo de números (string mientras se escribe, number al guardar)
  const [initialBalanceInput, setInitialBalanceInput] = useState<string>('');
  const [creditLimitInput, setCreditLimitInput] = useState<string>('');
  const [interestRateInput, setInterestRateInput] = useState<string>('');

  // Inicializar order si no existe
  useEffect(() => {
    accounts.forEach((account, index) => {
      if (account.order === undefined) {
        updateAccount(account.id!, { order: index });
      }
    });
  }, []);

  // Filtrar cuentas de ahorro para asociación con TC
  const savingsAccounts: Account[] = accounts.filter(acc => acc.type === 'savings');

  // ⚡ Función optimizada para cerrar modal rápidamente
  const closeAccountModal = useCallback(() => {
    setShowAccountForm(false);
    setEditingAccount(null);
    setBalanceAdjustment('');
    setInitialBalanceInput('');
    setCreditLimitInput('');
    setInterestRateInput('');
    setNewAccount({
      name: '',
      type: 'savings',
      initialBalance: 0,
      creditLimit: 0,
      cutoffDay: 1,
      paymentDay: 10,
      bankAccountId: undefined,
      interestRate: 0
    });
  }, []);

  // Handlers de drag and drop
  const handleDragStart = (e: React.DragEvent, accountId: string) => {
    setDraggedAccountId(accountId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, accountId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedAccountId !== accountId) {
      setDragOverAccountId(accountId);
    }
  };

  const handleDragLeave = () => {
    setDragOverAccountId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetAccountId: string) => {
    e.preventDefault();
    
    if (!draggedAccountId || draggedAccountId === targetAccountId) {
      setDraggedAccountId(null);
      setDragOverAccountId(null);
      return;
    }

    // Obtener todas las cuentas principales (no tarjetas asociadas)
    const mainAccounts = accounts.filter(acc => acc.type !== 'credit' || !acc.bankAccountId);
    const draggedAccount = mainAccounts.find(acc => acc.id === draggedAccountId);
    const targetAccount = mainAccounts.find(acc => acc.id === targetAccountId);

    if (!draggedAccount || !targetAccount) return;

    // Reordenar
    const sortedAccounts = [...mainAccounts].sort((a, b) => (a.order || 0) - (b.order || 0));
    const draggedIndex = sortedAccounts.findIndex(acc => acc.id === draggedAccountId);
    const targetIndex = sortedAccounts.findIndex(acc => acc.id === targetAccountId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Crear nuevo array con el orden actualizado
    const newOrder = [...sortedAccounts];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    // Actualizar el order de todas las cuentas
    await Promise.all(
      newOrder.map((account, index) => updateAccount(account.id!, { order: index }))
    );

    setDraggedAccountId(null);
    setDragOverAccountId(null);
  };

  const handleDragEnd = () => {
    setDraggedAccountId(null);
    setDragOverAccountId(null);
  };

  // Touch handlers para mobile
  const handleTouchStart = (e: React.TouchEvent, accountId: string) => {
    const touch = e.touches[0];
    setTouchStartY(touch.clientY);
    setTouchCurrentY(touch.clientY);
    setDraggedAccountId(accountId);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggedAccountId || !touchStartY) return;
    
    const touch = e.touches[0];
    setTouchCurrentY(touch.clientY);

    // Encontrar el elemento sobre el que está el dedo
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const accountCard = element?.closest('[data-account-id]');
    
    if (accountCard) {
      const targetId = accountCard.getAttribute('data-account-id');
      if (targetId && targetId !== draggedAccountId) {
        setDragOverAccountId(targetId);
      }
    }
  };

  const handleTouchEnd = async () => {
    if (!draggedAccountId || !dragOverAccountId) {
      setDraggedAccountId(null);
      setDragOverAccountId(null);
      setTouchStartY(null);
      setTouchCurrentY(null);
      return;
    }

    // Reordenar usando la misma lógica que handleDrop
    const mainAccounts = accounts.filter(acc => acc.type !== 'credit' || !acc.bankAccountId);
    const sortedAccounts = [...mainAccounts].sort((a, b) => (a.order || 0) - (b.order || 0));
    const draggedIndex = sortedAccounts.findIndex(acc => acc.id === draggedAccountId);
    const targetIndex = sortedAccounts.findIndex(acc => acc.id === dragOverAccountId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const newOrder = [...sortedAccounts];
      const [removed] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, removed);

      await Promise.all(
        newOrder.map((account, index) => updateAccount(account.id!, { order: index }))
      );
    }

    setDraggedAccountId(null);
    setDragOverAccountId(null);
    setTouchStartY(null);
    setTouchCurrentY(null);
  };

  const accountTypes = [
    { value: 'savings' as const, label: 'Cuenta de Ahorros', icon: Wallet },
    { value: 'credit' as const, label: 'Tarjeta de Crédito', icon: CreditCard },
    { value: 'cash' as const, label: 'Efectivo', icon: Banknote }
  ];

  const getCreditUsed = (accountId: string): number => {
    const account = accounts.find(a => a.id === accountId);
    if (!account || account.type !== 'credit') return 0;
    
    // Debug: verificar transacciones de esta TC
    const accountTransactions = transactions.filter(t => t.accountId === accountId);
    
    // Usar BalanceCalculator para obtener el cupo utilizado (pendiente)
    return BalanceCalculator.calculateCreditCardUsed(account, transactions);
  };

  const getNextCutoffDate = (account: Account): Date | null => {
    if (account.type !== 'credit' || !account.cutoffDay) return null;

    const today = new Date();
    const cutoffDay = account.cutoffDay;
    // El corte siempre debe mostrar el mes anterior si aún no ha llegado el día de corte
    const cutoffDate = new Date(today.getFullYear(), today.getMonth(), cutoffDay);

    if (today.getDate() < cutoffDay) {
      // Si no hemos llegado al día de corte, el último corte fue el mes anterior
      cutoffDate.setMonth(cutoffDate.getMonth() - 1);
    }

    return cutoffDate;
  };

  const getNextPaymentDate = (account: Account): Date | null => {
    if (account.type !== 'credit' || !account.paymentDay) return null;

    const today = new Date();
    const cutoffDay = account.cutoffDay || 1;
    const paymentDay = account.paymentDay;
    
    // Si aún no hemos llegado al día de corte, el pago es de este mes
    // Si ya pasamos el día de corte, el pago es del siguiente mes
    let paymentMonth = today.getMonth();
    
    if (today.getDate() >= cutoffDay) {
      // Ya pasó el corte de este mes, el pago es para el siguiente mes
      paymentMonth = today.getMonth() + 1;
    }
    
    const paymentDate = new Date(today.getFullYear(), paymentMonth, paymentDay);

    return paymentDate;
  };

  const addOrUpdateAccount = async (): Promise<void> => {
    if (!newAccount.name.trim()) {
      showToast.error(ERROR_MESSAGES.EMPTY_ACCOUNT_NAME);
      return;
    }

    try {
      if (editingAccount) {
        // Validar ajuste de saldo ANTES de cerrar modal
        let needsBalanceAdjustment = false;
        let adjustmentData = null;

        if (balanceAdjustment.trim() !== '') {
          const cleanValue = balanceAdjustment.trim().replace(/\./g, '').replace(',', '.');
          const newBalance = parseFloat(cleanValue);

          if (isNaN(newBalance) || newBalance < 0) {
            showToast.error('Ingresa un saldo válido (debe ser un número positivo)');
            return;
          }

          const currentBalance = getAccountBalance(editingAccount.id!);
          const adjustment = newBalance - currentBalance;

          if (Math.abs(adjustment) >= 0.01) {
            needsBalanceAdjustment = true;
            adjustmentData = {
              type: adjustment > 0 ? 'income' as const : 'expense' as const,
              amount: Math.abs(adjustment),
              category: 'Otros',
              description: `Ajuste de saldo: ${adjustment > 0 ? '+' : ''}${formatCurrency(adjustment)}`,
              date: new Date(),
              paid: true,
              accountId: editingAccount.id!
            };
          }
        }

        // ⚡ CERRAR MODAL INMEDIATAMENTE (UX optimizada)
        const accountId = editingAccount.id!;
        closeAccountModal();

        // Preparar actualizaciones
        const updates: Partial<Account> = { name: newAccount.name.trim() };

        // Si es tarjeta de crédito, permitir actualizar el límite
        if (editingAccount.type === 'credit' && newAccount.creditLimit) {
          updates.creditLimit = newAccount.creditLimit;
        }

        // Ejecutar operaciones asíncronas después del cierre
        await updateAccount(accountId, updates);

        if (needsBalanceAdjustment && adjustmentData) {
          await addTransaction(adjustmentData);
          showToast.success('Cuenta actualizada y saldo ajustado correctamente');
        } else {
          showToast.success(SUCCESS_MESSAGES.ACCOUNT_UPDATED);
        }
      } else {
        // Validaciones previas
        if (newAccount.type === 'credit') {
          const creditLimit = parseFloat(newAccount.creditLimit.toString());
          if (!newAccount.creditLimit || isNaN(creditLimit) || creditLimit <= 0) {
            showToast.error(ERROR_MESSAGES.INVALID_CREDIT_LIMIT);
            return;
          }

          const cutoffDay = parseInt(newAccount.cutoffDay.toString());
          const paymentDay = parseInt(newAccount.paymentDay.toString());

          if (cutoffDay < 1 || cutoffDay > 31) {
            showToast.error(ERROR_MESSAGES.INVALID_CUTOFF_DAY);
            return;
          }

          if (paymentDay < 1 || paymentDay > 31) {
            showToast.error(ERROR_MESSAGES.INVALID_PAYMENT_DAY);
            return;
          }
        } else {
          const initialBalance = parseFloat(newAccount.initialBalance.toString());
          if (newAccount.initialBalance && isNaN(initialBalance)) {
            showToast.error(ERROR_MESSAGES.INVALID_INITIAL_BALANCE);
            return;
          }
        }

        // Preparar datos de la cuenta
        const accountData = {
          name: newAccount.name.trim(),
          type: newAccount.type,
          isDefault: false,
          initialBalance: parseFloat(newAccount.initialBalance.toString()) || 0,
          creditLimit: parseFloat(newAccount.creditLimit.toString()) || 0,
          cutoffDay: parseInt(newAccount.cutoffDay.toString()) || 1,
          paymentDay: parseInt(newAccount.paymentDay.toString()) || 10,
          bankAccountId: newAccount.bankAccountId,
          interestRate: parseFloat(newAccount.interestRate.toString()) || 0
        };

        // ⚡ CERRAR MODAL INMEDIATAMENTE (UX optimizada)
        closeAccountModal();

        // Ejecutar operación asíncrona después del cierre
        await addAccount(accountData);
        showToast.success(SUCCESS_MESSAGES.ACCOUNT_ADDED);
      }
    } catch (error) {
      showToast.error(ERROR_MESSAGES.ADD_ACCOUNT_ERROR);
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
      paymentDay: account.paymentDay || 10,
      bankAccountId: account.bankAccountId,
      interestRate: account.interestRate || 0
    });
    // Inicializar inputs de formateo con valores actuales
    setInitialBalanceInput(account.initialBalance.toString());
    setCreditLimitInput((account.creditLimit || 0).toString());
    
    // Formatear interestRate: convertir 23.99 a "2399" y luego a "23,99"
    const rate = account.interestRate || 0;
    const rateAsInteger = Math.round(rate * 100).toString().padStart(1, '0');
    const formattedRate = rateAsInteger.length > 2 
      ? rateAsInteger.slice(0, -2) + ',' + rateAsInteger.slice(-2)
      : rateAsInteger;
    setInterestRateInput(formattedRate);
    
    setShowAccountForm(true);
  };

  const handleAddCategory = (): void => {
    try {
      addCategory(newCategory.type, newCategory.name);
      setNewCategory({ type: 'expense', name: '' });
      setShowCategoryForm(false);
      showToast.success(SUCCESS_MESSAGES.CATEGORY_ADDED);
    } catch (error) {
      showToast.error((error as Error).message);
    }
  };

  const handleDeleteAccount = async (accountId: string): Promise<void> => {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;

    if (deleteConfirmName.trim() !== account.name) {
      showToast.error('El nombre ingresado no coincide con el nombre de la cuenta');
      return;
    }

    const transactionCount = getTransactionCountForAccount(accountId);

    // Validar checkbox si hay transacciones
    if (transactionCount > 0 && !confirmDeleteWithTransactions) {
      showToast.error('Debes confirmar que deseas eliminar las transacciones asociadas');
      return;
    }

    try {
      await deleteAccount(accountId);
      setShowDeleteConfirm(null);
      setDeleteConfirmName('');
      setConfirmDeleteWithTransactions(false);

      if (transactionCount > 0) {
        showToast.success(
          `Cuenta "${account.name}" eliminada correctamente junto con ${transactionCount} transacción${transactionCount !== 1 ? 'es' : ''} asociada${transactionCount !== 1 ? 's' : ''}`
        );
      } else {
        showToast.success(`Cuenta "${account.name}" eliminada correctamente`);
      }
    } catch (error) {
      const errorMessage = (error as Error).message || 'Error desconocido al eliminar la cuenta';
      showToast.error(`Error: ${errorMessage}`);
      console.error(error);
    }
  };

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Cuentas</h3>

        <div className="flex gap-3">
          <button
            onClick={() => {
              if (showAccountForm) {
                setBalanceAdjustment('');
                setNewAccount({
                  name: '',
                  type: 'savings',
                  initialBalance: 0,
                  creditLimit: 0,
                  cutoffDay: 1,
                  paymentDay: 10,
                  interestRate: 0
                });
              } else {
                setShowCategoryForm(false);
                setEditingAccount(null);
                setBalanceAdjustment('');
                setNewAccount({
                  name: '',
                  type: 'savings',
                  initialBalance: 0,
                  creditLimit: 0,
                  cutoffDay: 1,
                  paymentDay: 10,
                  interestRate: 0
                });
                setShowAccountForm(true);
              }
            }}
            className="btn-primary"
          >
            <Plus size={18} />
            Nueva Cuenta
          </button>

          <button
            onClick={() => {
              if (showCategoryForm) {
                setShowCategoryForm(false);
              } else {
                setShowAccountForm(false);
                setEditingAccount(null);
                setShowCategoryForm(true);
              }
            }}
            className="btn-secondary"
          >
            <Plus size={18} />
            Nueva Categoría
          </button>
        </div>
      </div>

      {showAccountForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}
                </h4>
                <button
                  onClick={() => {
                    setShowAccountForm(false);
                    setEditingAccount(null);
                    setBalanceAdjustment('');
                    setNewAccount({
                      name: '',
                      type: 'savings',
                      initialBalance: 0,
                      creditLimit: 0,
                      cutoffDay: 1,
                      paymentDay: 10,
                      bankAccountId: undefined,
                      interestRate: 0
                    });
                  }}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                  <X size={24} />
                </button>
              </div>

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
            {editingAccount && editingAccount.type === 'credit' && (
              <div>
                <label className="label-base">Límite de Crédito</label>
                <input
                  type="text"
                  value={formatNumberForInput(creditLimitInput)}
                  onChange={(e) => {
                    const unformatted = unformatNumber(e.target.value);
                    setCreditLimitInput(unformatted);
                    const numValue = parseFloat(unformatted.replace(',', '.')) || 0;
                    setNewAccount({...newAccount, creditLimit: numValue});
                  }}
                  placeholder="0"
                  className="input-base"
                />
              </div>
            )}
            {editingAccount && editingAccount.type !== 'credit' && (
              <div>
                <label className="label-base">Ajustar saldo (opcional)</label>
                <input
                  type="text"
                  value={formatNumberForInput(balanceAdjustment)}
                  placeholder={`Saldo actual: ${formatCurrency(getAccountBalance(editingAccount.id!))}`}
                  onChange={(e) => {
                    const unformatted = unformatNumber(e.target.value);
                    setBalanceAdjustment(unformatted);
                  }}
                  className="input-base"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Ingresa el nuevo saldo deseado. Se creará un ajuste automático.
                </p>
              </div>
            )}

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
                      type="text"
                      value={formatNumberForInput(initialBalanceInput)}
                      onChange={(e) => {
                        const unformatted = unformatNumber(e.target.value);
                        setInitialBalanceInput(unformatted);
                        // Convertir a número para el estado
                        const numValue = parseFloat(unformatted.replace(',', '.')) || 0;
                        setNewAccount({...newAccount, initialBalance: numValue});
                      }}
                      placeholder="0"
                      className="input-base"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="label-base">Banco asociado (opcional)</label>
                      <select
                        value={newAccount.bankAccountId || ''}
                        onChange={(e) => setNewAccount({...newAccount, bankAccountId: e.target.value || undefined})}
                        className="input-base"
                      >
                        <option value="">Sin asociar</option>
                        {savingsAccounts.map((acc: Account) => {
                          const editId = (editingAccount as Account | null)?.id;
                          if (acc.id && acc.id !== editId) {
                            return (
                              <option key={acc.id} value={acc.id}>
                                {acc.name}
                              </option>
                            );
                          }
                          return null;
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="label-base">Cupo total</label>
                      <input
                        type="text"
                        value={formatNumberForInput(creditLimitInput)}
                        onChange={(e) => {
                          const unformatted = unformatNumber(e.target.value);
                          setCreditLimitInput(unformatted);
                          // Convertir a número para el estado
                          const numValue = parseFloat(unformatted.replace(',', '.')) || 0;
                          setNewAccount({...newAccount, creditLimit: numValue});
                        }}
                        placeholder="0"
                        className="input-base"
                      />
                    </div>

                    <div>
                      <label className="label-base">Tasa de Interés E.A. (%)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={interestRateInput}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Eliminar todo excepto números
                          const numericOnly = value.replace(/[^0-9]/g, '');
                          
                          // Limitar a 4 dígitos (máximo 99,99)
                          const limited = numericOnly.slice(0, 4);
                          
                          // Formatear con coma automáticamente
                          let formatted = limited;
                          if (limited.length > 2) {
                            // Insertar coma antes de los últimos 2 dígitos
                            formatted = limited.slice(0, -2) + ',' + limited.slice(-2);
                          }
                          
                          setInterestRateInput(formatted);
                          
                          // Convertir a número decimal para guardar
                          if (limited === '') {
                            setNewAccount({...newAccount, interestRate: 0});
                          } else {
                            // Dividir por 100 para obtener el valor decimal
                            const decimalValue = parseInt(limited, 10) / 100;
                            setNewAccount({...newAccount, interestRate: decimalValue});
                          }
                        }}
                        placeholder="23,99"
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

              <div className="flex gap-3 mt-6">
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
                      paymentDay: 10,
                      bankAccountId: undefined,
                      interestRate: 0
                    });
                  }}
                  className="btn-cancel"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCategoryForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nueva Categoría</h4>
                <button
                  onClick={() => setShowCategoryForm(false)}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                  <X size={24} />
                </button>
              </div>

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

              <div className="flex gap-3 mt-6">
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
          </div>
        </div>
      )}

      <div className="space-y-4">
        {accounts
          .filter(account => account.type !== 'credit' || !account.bankAccountId)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map(account => {
            const balance = getAccountBalance(account.id!);
            const creditUsed = getCreditUsed(account.id!);
            const nextCutoff = getNextCutoffDate(account);
            const nextPayment = getNextPaymentDate(account);
            const accountTypeInfo = accountTypes.find(t => t.value === account.type);
            
            // Buscar tarjetas asociadas a esta cuenta
            const associatedCards = accounts.filter(acc => 
              acc.type === 'credit' && acc.bankAccountId === account.id
            );

            return (
              <div key={account.id}>
                {/* Cuenta principal */}
                <div
                  data-account-id={account.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, account.id!)}
                  onDragOver={(e) => handleDragOver(e, account.id!)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, account.id!)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => handleTouchStart(e, account.id!)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className={`rounded-xl p-5 transition-all touch-none select-none ${
                    draggedAccountId === account.id
                      ? 'opacity-50 scale-95 shadow-2xl'
                      : dragOverAccountId === account.id
                      ? 'border-2 border-purple-500 shadow-lg scale-102 bg-purple-50 dark:bg-purple-900/30'
                      : account.isDefault
                      ? 'border-2 border-purple-500 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 shadow-md'
                      : 'border border-purple-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md'
                  }`}
                  style={{
                    cursor: draggedAccountId === account.id ? 'grabbing' : 'grab',
                    transform: draggedAccountId === account.id && touchCurrentY && touchStartY 
                      ? `translateY(${touchCurrentY - touchStartY}px)` 
                      : undefined,
                    zIndex: draggedAccountId === account.id ? 50 : undefined
                  }}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="flex-1 w-full sm:w-auto">
                      <div className="flex items-center gap-2 mb-2">
                        <GripVertical size={20} className="text-gray-400 cursor-grab active:cursor-grabbing" />
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
                        {account.type === 'credit' && account.bankAccountId && (
                          <span className="ml-2 text-purple-600 dark:text-purple-400">
                            • {accounts.find(acc => acc.id === account.bankAccountId)?.name}
                          </span>
                        )}
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

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mt-3">
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
                      ) : null}
                    </div>

                    <div className="text-right ml-0 sm:ml-6 mt-3 sm:mt-0">
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

                      <div className="flex flex-wrap gap-2 justify-end">
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
                              onClick={() => {
                                setShowDeleteConfirm(account.id!);
                                setDeleteConfirmName('');
                              }}
                              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tarjetas asociadas - renderizadas debajo */}
                {associatedCards.length > 0 && (
                  <div className="ml-4 sm:ml-8 mt-3 space-y-3 border-l-2 border-purple-200 dark:border-purple-800 pl-4">
                    {associatedCards.map(card => {
                      const cardBalance = getAccountBalance(card.id!);
                      const cardCreditUsed = getCreditUsed(card.id!);
                      const cardNextCutoff = getNextCutoffDate(card);
                      const cardNextPayment = getNextPaymentDate(card);
                      const cardTypeInfo = accountTypes.find(t => t.value === card.type);

                      return (
                        <div
                          key={card.id}
                          className={`rounded-xl p-4 sm:p-5 transition-all border border-purple-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md ${
                            card.isDefault ? 'ring-2 ring-purple-400' : ''
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div className="flex-1 w-full sm:w-auto">
                              <div className="flex items-center gap-2 mb-2">
                                {cardTypeInfo && React.createElement(cardTypeInfo.icon, {
                                  size: 18,
                                  className: "text-purple-600 dark:text-purple-400"
                                })}
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                                    {card.name}
                                  </h4>
                                  {card.isDefault && (
                                    <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full font-medium">
                                      Principal
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                                {cardTypeInfo?.label}
                                <span className="ml-2 text-purple-600 dark:text-purple-400">
                                  • {account.name}
                                </span>
                              </p>

                              <div className="mt-3">
                                <div className="flex justify-between text-xs sm:text-sm mb-1.5">
                                  <span className="text-gray-600 dark:text-gray-400">Cupo utilizado</span>
                                  <span className="font-medium text-gray-900 dark:text-gray-100">
                                    {formatCurrency(cardCreditUsed)} / {formatCurrency(card.creditLimit!)}
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-purple-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      cardCreditUsed > (card.creditLimit || 0) * 0.8 ? 'bg-rose-500' : 'bg-purple-600'
                                    }`}
                                    style={{ width: `${Math.min((cardCreditUsed / card.creditLimit!) * 100, 100)}%` }}
                                  />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mt-3">
                                  <div className="text-xs sm:text-sm">
                                    <div className="text-gray-500 dark:text-gray-400">Corte</div>
                                    <div className="font-medium text-gray-900 dark:text-gray-100">
                                      {cardNextCutoff?.toLocaleDateString('es-CO')}
                                    </div>
                                  </div>
                                  <div className="text-xs sm:text-sm">
                                    <div className="text-gray-500 dark:text-gray-400">Pago</div>
                                    <div className="font-medium text-gray-900 dark:text-gray-100">
                                      {cardNextPayment?.toLocaleDateString('es-CO')}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="text-right ml-0 sm:ml-6 mt-3 sm:mt-0">
                              <div className={`text-xl sm:text-2xl font-bold mb-3 ${
                                cardBalance >= 0 ? 'text-purple-600' : 'text-rose-600'
                              }`}>
                                <div className="text-xs font-normal text-gray-500 mb-1">
                                  Disponible
                                </div>
                                {formatCurrency(cardBalance)}
                              </div>

                              <div className="flex flex-wrap gap-2 justify-end">
                                <button
                                  onClick={() => editAccount(card)}
                                  className="btn-edit"
                                >
                                  <Edit2 size={14} />
                                  Editar
                                </button>

                                {!card.isDefault && (
                                  <>
                                    <button
                                      onClick={() => setDefaultAccount(card.id!)}
                                      className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                                    >
                                      Principal
                                    </button>
                                    <button
                                      onClick={() => {
                                        setShowDeleteConfirm(card.id!);
                                        setDeleteConfirmName('');
                                      }}
                                      className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
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
                )}
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
                  {!(PROTECTED_CATEGORIES.expense as readonly string[]).includes(cat) && (
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
                  {!(PROTECTED_CATEGORIES.income as readonly string[]).includes(cat) && (
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (() => {
        const accountToDelete = accounts.find(a => a.id === showDeleteConfirm);
        const transactionCount = getTransactionCountForAccount(showDeleteConfirm);

        const handleClose = () => {
          setShowDeleteConfirm(null);
          setDeleteConfirmName('');
          setConfirmDeleteWithTransactions(false);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-400 mb-4">
                  ⚠️ Eliminar Cuenta
                </h3>

                {transactionCount > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Esta cuenta tiene {transactionCount} transacción{transactionCount !== 1 ? 'es' : ''} asociada{transactionCount !== 1 ? 's' : ''}.
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      Al eliminar la cuenta, todas las transacciones también serán eliminadas permanentemente.
                    </p>
                  </div>
                )}

                <p className="text-gray-600 dark:text-gray-300 mb-2">
                  Para confirmar la eliminación, escribe el nombre de la cuenta:
                </p>
                <p className="font-semibold text-lg text-gray-900 dark:text-white mb-4">
                  {accountToDelete?.name}
                </p>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder="Nombre de la cuenta"
                  className="input-base mb-4"
                  autoFocus
                />

                {transactionCount > 0 && (
                  <label className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-6 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={confirmDeleteWithTransactions}
                      onChange={(e) => setConfirmDeleteWithTransactions(e.target.checked)}
                      className="mt-0.5 h-5 w-5 rounded border-gray-300 text-rose-600 focus:ring-rose-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 leading-tight">
                      Entiendo que al eliminar esta cuenta, también se eliminarán permanentemente las <strong>{transactionCount} transacción{transactionCount !== 1 ? 'es' : ''}</strong> asociada{transactionCount !== 1 ? 's' : ''}.
                    </span>
                  </label>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => handleDeleteAccount(showDeleteConfirm)}
                    disabled={
                      deleteConfirmName.trim() !== accountToDelete?.name ||
                      (transactionCount > 0 && !confirmDeleteWithTransactions)
                    }
                    className="flex-1 bg-rose-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Eliminar {transactionCount > 0 ? `cuenta y ${transactionCount} transacción${transactionCount !== 1 ? 'es' : ''}` : 'cuenta'}
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 btn-cancel"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};