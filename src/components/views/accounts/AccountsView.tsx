'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Wallet, CreditCard, Banknote } from 'lucide-react';
import { BALANCE_ADJUSTMENT_CATEGORY } from '../../../config/constants';
import { showToast } from '../../../utils/toastHelpers';
import { CreditCardCalculator } from '../../../utils/balanceCalculator';
import { useFinance } from '../../../contexts/FinanceContext';
import type { Account } from '../../../types/finance';
import type { MergeCreditCardsParams } from '../../../hooks/useAccounts';

import { AccountFormModal } from './components/AccountFormModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { MergeCreditCardsModal } from './components/MergeCreditCardsModal';
import { CreditCardsConsolidatedSummary } from './components/CreditCardsConsolidatedSummary';
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
    mergeCreditCards: mergeCreditCardsDomain,
    setDefaultAccount,
    getAccountBalance,
    getTransactionCountForAccount,
    formatCurrency,
    addTransaction,
  } = useFinance();
  // Mapa memoizado de cupo usado por tarjeta (evita recalcular en cada render)
  const creditUsedMap = useMemo(() => {
    const map = new Map<string, number>();
    accounts.forEach(a => {
      if (a.type === 'credit' && a.id) {
        map.set(a.id, CreditCardCalculator.calculateUsedCredit(a, transactions));
      }
    });
    return map;
  }, [accounts, transactions]);

  const getCreditUsed = useCallback((accountId: string): number => {
    return creditUsedMap.get(accountId) ?? 0;
  }, [creditUsedMap]);

  const creditCardSummary = useMemo(() => {
    const cards = accounts
      .filter((account) => account.type === 'credit' && account.id)
      .map((account) => {
        const creditLimit = account.creditLimit || 0;
        const used = creditUsedMap.get(account.id!) ?? 0;
        const available = Math.max(0, creditLimit - used);
        const usagePercentage = creditLimit > 0
          ? Math.min((used / creditLimit) * 100, 100)
          : 0;

        return {
          id: account.id!,
          name: account.name,
          creditLimit,
          used,
          available,
          usagePercentage,
        };
      });

    const totalLimit = cards.reduce((sum, card) => sum + card.creditLimit, 0);
    const totalUsed = cards.reduce((sum, card) => sum + card.used, 0);
    const totalAvailable = Math.max(0, totalLimit - totalUsed);
    const usagePercentage = totalLimit > 0
      ? Math.min((totalUsed / totalLimit) * 100, 100)
      : 0;

    return {
      cards,
      totalLimit,
      totalUsed,
      totalAvailable,
      usagePercentage,
    };
  }, [accounts, creditUsedMap]);

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

  const [mergeSourceCard, setMergeSourceCard] = useState<Account | null>(null);
  const [mergeTargetCardId, setMergeTargetCardId] = useState('');
  const [mergeCreditLimitInput, setMergeCreditLimitInput] = useState('');
  const [mergeDesiredDebtInput, setMergeDesiredDebtInput] = useState('');
  const [isMergingCreditCards, setIsMergingCreditCards] = useState(false);

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

  const creditCards = accounts.filter((acc) => acc.type === 'credit' && acc.id);
  const mergeTargetCard = creditCards.find((card) => card.id === mergeTargetCardId) || null;
  const mergeCombinedCreditLimit = (mergeSourceCard?.creditLimit || 0) + (mergeTargetCard?.creditLimit || 0);
  const mergeCombinedUsedDebt = (mergeSourceCard?.id ? getCreditUsed(mergeSourceCard.id) : 0)
    + (mergeTargetCard?.id ? getCreditUsed(mergeTargetCard.id) : 0);
  const mergeCombinedAvailableCredit = mergeCombinedCreditLimit - mergeCombinedUsedDebt;

  const parseCurrencyInput = (value: string): number => parseFloat(value.replace(',', '.'));

  const openMergeCreditCardsModal = (sourceCard: Account) => {
    const defaultTargetCard = creditCards.find((card) =>
      card.id !== sourceCard.id
      && sourceCard.bankAccountId != null
      && card.bankAccountId === sourceCard.bankAccountId
    );

    if (!defaultTargetCard) {
      showToast.error('Necesitas al menos dos tarjetas de crédito del mismo banco para unificar');
      return;
    }

    const combinedLimit = (sourceCard.creditLimit || 0) + (defaultTargetCard.creditLimit || 0);
    setMergeSourceCard(sourceCard);
    setMergeTargetCardId(defaultTargetCard.id!);
    setMergeCreditLimitInput(combinedLimit.toString());
    setMergeDesiredDebtInput('');
  };

  const closeMergeCreditCardsModal = () => {
    if (isMergingCreditCards) return;
    setMergeSourceCard(null);
    setMergeTargetCardId('');
    setMergeCreditLimitInput('');
    setMergeDesiredDebtInput('');
  };

  const handleMergeTargetChange = (targetCardId: string) => {
    const nextTargetCard = creditCards.find((card) => card.id === targetCardId);
    setMergeTargetCardId(targetCardId);
    setMergeCreditLimitInput(((mergeSourceCard?.creditLimit || 0) + (nextTargetCard?.creditLimit || 0)).toString());
    setMergeDesiredDebtInput('');
  };

  const mergeCreditCards = async () => {
    if (!mergeSourceCard?.id || !mergeTargetCard?.id) return;

    const newCreditLimit = parseCurrencyInput(mergeCreditLimitInput);
    if (isNaN(newCreditLimit) || newCreditLimit <= 0) {
      showToast.error('El nuevo cupo debe ser mayor que cero');
      return;
    }

    const desiredDebt = mergeDesiredDebtInput.trim() === ''
      ? mergeCombinedUsedDebt
      : parseCurrencyInput(mergeDesiredDebtInput);

    if (isNaN(desiredDebt) || desiredDebt < 0) {
      showToast.error('Ingresa una deuda real deseada válida (debe ser un número positivo)');
      return;
    }

    const warningDebt = Math.max(mergeCombinedUsedDebt, desiredDebt);

    if (newCreditLimit < warningDebt) {
      const shouldContinue = window.confirm(
        `El nuevo cupo (${formatCurrency(newCreditLimit)}) queda por debajo de la deuda usada (${formatCurrency(warningDebt)}). ¿Deseas continuar?`
      );
      if (!shouldContinue) return;
    }

    const debtDifference = desiredDebt - mergeCombinedUsedDebt;

    try {
      setIsMergingCreditCards(true);

      // Usar la operación de dominio atómica que migra transacciones, recurring payments y debts
      const params: MergeCreditCardsParams = {
        sourceAccountIds: [mergeSourceCard.id],
        destination: {
          id: mergeTargetCard.id,
          name: mergeTargetCard.name,
          creditLimit: newCreditLimit,
          isDefault: mergeSourceCard.isDefault || mergeTargetCard.isDefault,
        },
      };

      await mergeCreditCardsDomain(params);

      // Si la deuda deseada difiere de la combinada, crear ajuste
      if (Math.abs(debtDifference) >= 0.01) {
        await addTransaction({
          type: debtDifference > 0 ? 'expense' : 'income',
          amount: Math.abs(debtDifference),
          category: BALANCE_ADJUSTMENT_CATEGORY,
          description: `Ajuste por unificación TC: ${debtDifference > 0 ? '+' : '-'}${formatCurrency(Math.abs(debtDifference))}`,
          date: new Date(),
          paid: true,
          accountId: mergeTargetCard.id,
        });
      }

      showToast.success(`Tarjetas unificadas en ${mergeTargetCard.name}`);
      setMergeSourceCard(null);
      setMergeTargetCardId('');
      setMergeCreditLimitInput('');
      setMergeDesiredDebtInput('');
    } catch (error) {
      showToast.error(`Error unificando tarjetas: ${(error as Error).message || 'Error desconocido'}`);
    } finally {
      setIsMergingCreditCards(false);
    }
  };

  const getNextCutoffDate = (account: Account): Date | null => {
    if (account.type !== 'credit' || !account.cutoffDay) return null;

    const today = new Date();
    const cutoffDay = account.cutoffDay;

    // Próximo corte: si hoy ya pasó el día de corte, es el mes siguiente
    let month = today.getMonth();
    let year = today.getFullYear();
    if (today.getDate() > cutoffDay) {
      month++;
      if (month > 11) { month = 0; year++; }
    }
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(cutoffDay, daysInMonth));
  };

  const getNextPaymentDate = (account: Account): Date | null => {
    if (account.type !== 'credit' || !account.paymentDay) return null;

    const today = new Date();
    const paymentDay = account.paymentDay;

    // Próximo pago: si hoy ya pasó el día de pago, es el mes siguiente
    let month = today.getMonth();
    let year = today.getFullYear();
    if (today.getDate() > paymentDay) {
      month++;
      if (month > 11) { month = 0; year++; }
    }
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(paymentDay, daysInMonth));
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
          `Cuenta "${account.name}" eliminada junto con ${transactionCount} transacción${transactionCount !== 1 ? 'es' : ''
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
      {/* Header con botón */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Cuentas
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Administra tus cuentas bancarias y tarjetas de crédito
          </p>
        </div>

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

      <CreditCardsConsolidatedSummary
        cards={creditCardSummary.cards}
        totalLimit={creditCardSummary.totalLimit}
        totalUsed={creditCardSummary.totalUsed}
        totalAvailable={creditCardSummary.totalAvailable}
        usagePercentage={creditCardSummary.usagePercentage}
        formatCurrency={formatCurrency}
      />

      <MergeCreditCardsModal
        isOpen={!!mergeSourceCard}
        sourceCard={mergeSourceCard}
        targetCardId={mergeTargetCardId}
        creditCards={creditCards.filter(card =>
          mergeSourceCard?.bankAccountId != null && card.bankAccountId === mergeSourceCard.bankAccountId
        )}
        combinedCreditLimit={mergeCombinedCreditLimit}
        combinedUsedDebt={mergeCombinedUsedDebt}
        combinedAvailableCredit={mergeCombinedAvailableCredit}
        newCreditLimitInput={mergeCreditLimitInput}
        desiredDebtInput={mergeDesiredDebtInput}
        isSubmitting={isMergingCreditCards}
        formatCurrency={formatCurrency}
        onTargetCardChange={handleMergeTargetChange}
        onNewCreditLimitChange={setMergeCreditLimitInput}
        onDesiredDebtChange={setMergeDesiredDebtInput}
        onConfirm={mergeCreditCards}
        onClose={closeMergeCreditCardsModal}
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
                onMerge={account.type === 'credit' && account.bankAccountId && creditCards.some(c => c.id !== account.id && c.bankAccountId === account.bankAccountId) ? () => openMergeCreditCardsModal(account) : undefined}
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
                  className={`ml-4 sm:ml-8 mt-3 space-y-3 border-l-2 border-purple-200 dark:border-purple-800 pl-4 transition-opacity duration-200 ${dragDrop.draggedAccountId === account.id ? 'opacity-50' : ''
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
                      onMerge={card.bankAccountId && creditCards.some(c => c.id !== card.id && c.bankAccountId === card.bankAccountId) ? () => openMergeCreditCardsModal(card) : undefined}
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
