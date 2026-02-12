'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Wallet, CreditCard, Banknote } from 'lucide-react';
import { showToast } from '../../../utils/toastHelpers';
import { BalanceCalculator } from '../../../utils/balanceCalculator';
import { useFinance } from '../../../contexts/FinanceContext';
import type { Account, Transaction, NewAccount } from '../../../types/finance';

import { AccountFormModal } from './components/AccountFormModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { AccountCard } from './components/AccountCard';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useAccountForm } from './hooks/useAccountForm';

const ACCOUNT_TYPES = [
  { value: 'savings' as const, label: 'Cuenta de Ahorros', icon: Wallet },
  { value: 'credit' as const, label: 'Crédito', icon: CreditCard },
  { value: 'cash' as const, label: 'Efectivo', icon: Banknote },
];

/**
 * Vista de Cuentas y Categorías
 * 
 * Componente orquestador que:
 * - Coordina los modales de crear/editar cuentas y categorías
 * - Maneja drag & drop para reordenar cuentas
 * - Renderiza la lista de cuentas con sus tarjetas asociadas
 */
export const AccountsView: React.FC = () => {
  const {
    accounts,
    transactions,
    addAccount,
    updateAccount,
    deleteAccount,
    setDefaultAccount,
    getAccountBalance,
    getTransactionCountForAccount,
    formatCurrency,
    addTransaction,
  } = useFinance();
  // Helpers (definidos antes de los hooks que los usan)
  const getCreditUsed = useCallback((accountId: string): number => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account || account.type !== 'credit') return 0;
    return BalanceCalculator.calculateCreditCardUsed(account, transactions);
  }, [accounts, transactions]);

  // Custom hooks
  const dragDrop = useDragAndDrop({ accounts, updateAccount });
  const accountForm = useAccountForm({
    addAccount,
    updateAccount,
    addTransaction,
    getAccountBalance,
    getCreditUsed,
    formatCurrency,
  });

  // Estados locales
  const [deleteConfirm, setDeleteConfirm] = useState<{
    accountId: string;
    name: string;
    confirmName: string;
    confirmTransactions: boolean;
  } | null>(null);

  // Inicializar order si no existe
  // AUDIT-FIX (MEDIO-01): deps correctas para evitar stale closures
  useEffect(() => {
    accounts.forEach((account, index) => {
      if (account.order === undefined) {
        updateAccount(account.id!, { order: index });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  // Filtrar cuentas de ahorro para asociación con TC
  const savingsAccounts = accounts.filter((acc) => acc.type === 'savings');

  const getNextCutoffDate = (account: Account): Date | null => {
    if (account.type !== 'credit' || !account.cutoffDay) return null;

    const today = new Date();
    const cutoffDay = account.cutoffDay;
    const cutoffDate = new Date(today.getFullYear(), today.getMonth(), cutoffDay);

    if (today.getDate() < cutoffDay) {
      cutoffDate.setMonth(cutoffDate.getMonth() - 1);
    }

    return cutoffDate;
  };

  const getNextPaymentDate = (account: Account): Date | null => {
    if (account.type !== 'credit' || !account.paymentDay) return null;

    const today = new Date();
    const cutoffDay = account.cutoffDay || 1;
    const paymentDay = account.paymentDay;

    let paymentMonth = today.getMonth();
    if (today.getDate() >= cutoffDay) {
      paymentMonth = today.getMonth() + 1;
    }

    return new Date(today.getFullYear(), paymentMonth, paymentDay);
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) return;

    const account = accounts.find((a) => a.id === deleteConfirm.accountId);
    if (!account) return;

    if (deleteConfirm.confirmName.trim() !== account.name) {
      showToast.error('El nombre ingresado no coincide con el nombre de la cuenta');
      return;
    }

    const transactionCount = getTransactionCountForAccount(deleteConfirm.accountId);

    if (transactionCount > 0 && !deleteConfirm.confirmTransactions) {
      showToast.error('Debes confirmar que deseas eliminar las transacciones asociadas');
      return;
    }

    try {
      await deleteAccount(deleteConfirm.accountId);
      setDeleteConfirm(null);

      if (transactionCount > 0) {
        showToast.success(
          `Cuenta "${account.name}" eliminada junto con ${transactionCount} transacción${
            transactionCount !== 1 ? 'es' : ''
          }`
        );
      } else {
        showToast.success(`Cuenta "${account.name}" eliminada correctamente`);
      }
    } catch (error) {
      showToast.error(`Error: ${(error as Error).message || 'Error desconocido'}`);
    }
  };

  // Cuentas principales (no asociadas)
  const mainAccounts = accounts
    .filter((account) => account.type !== 'credit' || !account.bankAccountId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="card">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Cuentas
        </h3>

        <div className="flex gap-3">
          <button
            onClick={() => {
              accountForm.openCreateForm();
            }}
            className="btn-primary"
          >
            <Plus size={18} />
            Nueva Cuenta
          </button>
        </div>
      </div>

      {/* Modales */}
      <AccountFormModal
        isOpen={accountForm.showAccountForm}
        editingAccount={accountForm.editingAccount}
        newAccount={accountForm.newAccount}
        balanceAdjustment={accountForm.balanceAdjustment}
        initialBalanceInput={accountForm.initialBalanceInput}
        creditLimitInput={accountForm.creditLimitInput}
        interestRateInput={accountForm.interestRateInput}
        savingsAccounts={savingsAccounts}
        accountTypes={ACCOUNT_TYPES}
        setNewAccount={accountForm.setNewAccount}
        setBalanceAdjustment={accountForm.setBalanceAdjustment}
        setInitialBalanceInput={accountForm.setInitialBalanceInput}
        setCreditLimitInput={accountForm.setCreditLimitInput}
        setInterestRateInput={accountForm.setInterestRateInput}
        onClose={accountForm.closeForm}
        onSubmit={accountForm.handleSubmit}
        formatNumberForInput={accountForm.formatNumberForInput}
        unformatNumber={accountForm.unformatNumber}
        formatCurrency={formatCurrency}
        getAccountBalance={getAccountBalance}
        getCreditUsed={getCreditUsed}
      />

      <DeleteConfirmModal
        isOpen={!!deleteConfirm}
        accountName={deleteConfirm?.name || ''}
        transactionCount={
          deleteConfirm ? getTransactionCountForAccount(deleteConfirm.accountId) : 0
        }
        deleteConfirmName={deleteConfirm?.confirmName || ''}
        confirmDeleteWithTransactions={deleteConfirm?.confirmTransactions || false}
        setDeleteConfirmName={(value) =>
          setDeleteConfirm((prev) => (prev ? { ...prev, confirmName: value } : null))
        }
        setConfirmDeleteWithTransactions={(value) =>
          setDeleteConfirm((prev) =>
            prev ? { ...prev, confirmTransactions: value } : null
          )
        }
        onConfirm={handleDeleteAccount}
        onClose={() => setDeleteConfirm(null)}
      />

      {/* Lista de cuentas */}
      <div className="space-y-4">
        {mainAccounts.map((account) => {
          const balance = getAccountBalance(account.id!);
          const creditUsed = getCreditUsed(account.id!);
          const nextCutoff = getNextCutoffDate(account);
          const nextPayment = getNextPaymentDate(account);

          // Tarjetas asociadas
          const associatedCards = accounts
            .filter((acc) => acc.type === 'credit' && acc.bankAccountId === account.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

          return (
            <div key={account.id}>
              {/* Cuenta principal */}
              <AccountCard
                account={account}
                balance={balance}
                creditUsed={creditUsed}
                nextCutoff={nextCutoff}
                nextPayment={nextPayment}
                isDragging={dragDrop.draggedAccountId === account.id}
                isDragOver={dragDrop.dragOverAccountId === account.id}
                touchTransform={
                  dragDrop.draggedAccountId === account.id &&
                  dragDrop.touchCurrentY &&
                  dragDrop.touchStartY
                    ? `translateY(${dragDrop.touchCurrentY - dragDrop.touchStartY}px)`
                    : undefined
                }
                formatCurrency={formatCurrency}
                onEdit={() => accountForm.openEditForm(account)}
                onSetDefault={() => setDefaultAccount(account.id!)}
                onDelete={() =>
                  setDeleteConfirm({
                    accountId: account.id!,
                    name: account.name,
                    confirmName: '',
                    confirmTransactions: false,
                  })
                }
                onDragStart={(e) => dragDrop.handleDragStart(e, account.id!)}
                onDragOver={(e) => dragDrop.handleDragOver(e, account.id!)}
                onDragLeave={dragDrop.handleDragLeave}
                onDrop={(e) => dragDrop.handleDrop(e, account.id!)}
                onDragEnd={dragDrop.handleDragEnd}
                onTouchStart={(e) => dragDrop.handleTouchStart(e, account.id!)}
                onTouchMove={dragDrop.handleTouchMove}
                onTouchEnd={dragDrop.handleTouchEnd}
              />

              {/* Tarjetas asociadas */}
              {associatedCards.length > 0 && (
                <div
                  className={`ml-4 sm:ml-8 mt-3 space-y-3 border-l-2 border-purple-200 dark:border-purple-800 pl-4 transition-opacity duration-200 ${
                    dragDrop.draggedAccountId === account.id ? 'opacity-50' : ''
                  }`}
                >
                  {associatedCards.map((card) => (
                    <AccountCard
                      key={card.id}
                      account={card}
                      balance={getAccountBalance(card.id!)}
                      creditUsed={getCreditUsed(card.id!)}
                      nextCutoff={getNextCutoffDate(card)}
                      nextPayment={getNextPaymentDate(card)}
                      parentAccountName={account.name}
                      isAssociated
                      isDragging={dragDrop.draggedAccountId === card.id}
                      isDragOver={dragDrop.dragOverAccountId === card.id}
                      touchTransform={
                        dragDrop.draggedAccountId === card.id &&
                        dragDrop.touchCurrentY &&
                        dragDrop.touchStartY
                          ? `translateY(${dragDrop.touchCurrentY - dragDrop.touchStartY}px)`
                          : undefined
                      }
                      formatCurrency={formatCurrency}
                      onEdit={() => accountForm.openEditForm(card)}
                      onSetDefault={() => setDefaultAccount(card.id!)}
                      onDelete={() =>
                        setDeleteConfirm({
                          accountId: card.id!,
                          name: card.name,
                          confirmName: '',
                          confirmTransactions: false,
                        })
                      }
                      onDragStart={(e) => dragDrop.handleDragStart(e, card.id!)}
                      onDragOver={(e) => dragDrop.handleDragOver(e, card.id!)}
                      onDragLeave={dragDrop.handleDragLeave}
                      onDrop={(e) => dragDrop.handleDrop(e, card.id!)}
                      onDragEnd={dragDrop.handleDragEnd}
                      onTouchStart={(e) => dragDrop.handleTouchStart(e, card.id!)}
                      onTouchMove={dragDrop.handleTouchMove}
                      onTouchEnd={dragDrop.handleTouchEnd}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
