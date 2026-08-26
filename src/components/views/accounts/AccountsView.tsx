'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Wallet, CreditCard, Banknote, Receipt, Sparkles } from 'lucide-react';
import { UI_LABELS } from '../../../config/constants';
import { ACTION_ICONS, sectionTitle, UI_TEXT } from '../../../config/ui';
import { showToast } from '../../../utils/toastHelpers';
import { parseCurrency } from '../../../utils/formatters';
import { useAccountDomain, useTransactionDomain, useRecurringDomain, useDebtsDomain, useFormatCurrency } from '../../../hooks/useFinanceSelectors';
import type { Account } from '../../../types/finance';
import type { MergeCreditCardsParams } from '../../../hooks/useAccounts';

import { AccountFormModal } from './components/AccountFormModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { MergeCreditCardsModal } from './components/MergeCreditCardsModal';
import { CreditCardsConsolidatedSummary } from './components/CreditCardsConsolidatedSummary';
import { CreditCardOptimizerModal } from './components/CreditCardOptimizerModal';
import { AccountCard } from './components/AccountCard';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useAccountForm } from './hooks/useAccountForm';
import { CardStatementsModal } from './components/CardStatementsModal';
import { useCardPaymentSchedule } from '../../../hooks/useCardPaymentSchedule';
import { buildCreditCardUsagePlans } from '../../../utils/creditCardOptimizer';
import { PaymentInstrumentsSection } from './components/PaymentInstrumentsSection';

const ACCOUNT_TYPES = [
  { value: 'savings' as const, label: UI_LABELS.accountTypes.savings, icon: Wallet },
  { value: 'credit' as const, label: UI_LABELS.accountTypes.credit, icon: CreditCard },
  { value: 'cash' as const, label: UI_LABELS.accountTypes.cash, icon: Banknote },
];
const NewIcon = ACTION_ICONS.new;

/**
 * Vista de Cuentas y Categorías
 * 
 * Componente orquestador que:
 * - Coordina los modales de crear/editar cuentas y categorías
 * - Maneja drag & drop para reordenar cuentas
 * - Renderiza la lista de cuentas con sus tarjetas asociadas
 */
interface AccountsViewProps {
  userId?: string | null;
}

export const AccountsView: React.FC<AccountsViewProps> = ({ userId = null }) => {
  const {
    accounts,
    addAccount,
    updateAccount,
    deleteAccount,
    mergeCreditCards: mergeCreditCardsDomain,
    setDefaultAccount,
    getAccountBalance,
    getCreditUsed,
    getTransactionCountForAccount,
    balancesReady,
    accountsLoading,
  } = useAccountDomain();
  const { balanceTransactions } = useTransactionDomain();
  const { recurringPayments } = useRecurringDomain();
  const { debts } = useDebtsDomain();
  const formatCurrency = useFormatCurrency();
  const [showStatements, setShowStatements] = useState(false);
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [paymentInstrumentsSelection, setPaymentInstrumentsSelection] = useState<{
    ownerId: string;
    accountId: string;
  } | null>(null);
  const paymentInstrumentsAccountId = paymentInstrumentsSelection?.ownerId === userId
    ? paymentInstrumentsSelection.accountId
    : null;

  useEffect(() => {
    if (paymentInstrumentsSelection && paymentInstrumentsSelection.ownerId !== userId) {
      setPaymentInstrumentsSelection(null);
    }
  }, [paymentInstrumentsSelection, userId]);

  const paymentSchedule = useCardPaymentSchedule(accounts, balanceTransactions, recurringPayments);
  // Mapa memoizado del cupo usado por tarjeta para el resumen (evita llamar al
  // accesor por tarjeta en cada render). El cálculo correcto (historial
  // completo, no la ventana paginada) vive en el store vía getCreditUsed; aquí
  // solo se cachea por id (#11).
  const creditUsedMap = useMemo(() => {
    const map = new Map<string, number>();
    accounts.forEach(a => {
      if (a.type === 'credit' && a.id) {
        map.set(a.id, getCreditUsed(a.id));
      }
    });
    return map;
  }, [accounts, getCreditUsed]);

  const usedCreditByCard = useMemo(() => {
    const map: Record<string, number> = {};
    creditUsedMap.forEach((used, cardId) => {
      map[cardId] = used;
    });
    return map;
  }, [creditUsedMap]);

  const cardUsagePlans = useMemo(() => (
    buildCreditCardUsagePlans(accounts, balanceTransactions, { usedCreditByCard })
  ), [accounts, balanceTransactions, usedCreditByCard]);

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
    balancesReady,
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
  // Guard de borrado en curso: el ref bloquea el doble clic en el mismo tick
  // (la acción es destructiva en cascada); el state deshabilita el botón (#accounts-8).
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const isDeletingAccountRef = useRef(false);

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
  const cardsNeedingStatementConfig = creditCards
    .filter((card) => !card.cutoffDay || !card.paymentDay)
    .map((card) => ({
      id: card.id!,
      name: card.name,
      usedCredit: creditUsedMap.get(card.id!) ?? 0,
    }));
  const mergeTargetCard = creditCards.find((card) => card.id === mergeTargetCardId) || null;
  const mergeCombinedCreditLimit = (mergeSourceCard?.creditLimit || 0) + (mergeTargetCard?.creditLimit || 0);

  // #11 — Baseline de deuda para la unificación.
  //
  // DECISIÓN: el baseline se toma del campo persistido `usedCredit` de cada tarjeta
  // (autoritativo), NO de getCreditUsed() — que recalcula desde `transactions`, un
  // array PAGINADO en memoria. Con paginación, getCreditUsed() puede ver solo una
  // fracción de las transacciones y devolver una deuda combinada artificialmente
  // baja. Una deuda deseada explícita se aplica dentro del merge contra el
  // historial reconciliado bajo lease, nunca contra este valor de render.
  //
  // `usedCredit` es el mismo campo que useAccounts consolida en el merge
  // (mergedUsedCredit) y que reconcilia en deleteAccount, así que el baseline
  // mostrado coincide con la deuda que realmente quedará en el destino. Solo se cae
  // a getCreditUsed() cuando una tarjeta todavía no tiene `usedCredit` persistido
  // (datos legacy previos a la migración del campo).
  const usedDebtForMerge = (card: Account | null | undefined): number => {
    if (!card?.id) return 0;
    return card.usedCredit != null ? Math.max(0, card.usedCredit) : getCreditUsed(card.id);
  };
  const mergeCombinedUsedDebt = usedDebtForMerge(mergeSourceCard) + usedDebtForMerge(mergeTargetCard);
  // Clamp a 0: si la deuda combinada supera el cupo, "disponible" es 0, no negativo (#accounts).
  const mergeCombinedAvailableCredit = Math.max(0, mergeCombinedCreditLimit - mergeCombinedUsedDebt);

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

    const newCreditLimit = parseCurrency(mergeCreditLimitInput);
    if (isNaN(newCreditLimit) || newCreditLimit <= 0) {
      showToast.error('El nuevo cupo debe ser mayor que cero');
      return;
    }

    const desiredDebt = mergeDesiredDebtInput.trim() === ''
      ? undefined
      : parseCurrency(mergeDesiredDebtInput);

    if (desiredDebt !== undefined && (!Number.isFinite(desiredDebt) || desiredDebt < 0)) {
      showToast.error('Ingresa una deuda real deseada válida (debe ser mayor o igual a cero)');
      return;
    }

    // Nota: si el nuevo cupo queda por debajo de la deuda, NO se bloquea con un
    // confirm nativo. El modal ya muestra un banner de advertencia inline y el
    // botón pasa a "Unificar de todas formas" (MergeCreditCardsModal), así el
    // usuario confirma de forma explícita y consistente con el resto de la UI.
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
        desiredDebt,
      };

      await mergeCreditCardsDomain(params);

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
    if (!deleteConfirm || isDeletingAccountRef.current) return;

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

    isDeletingAccountRef.current = true;
    setIsDeletingAccount(true);
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
    } finally {
      isDeletingAccountRef.current = false;
      setIsDeletingAccount(false);
    }
  };

  // Cuentas principales (no asociadas)
  const mainAccounts = accounts
    .filter((account) => account.type !== 'credit' || !account.bankAccountId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="card animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header con botón */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h2 id="view-heading-accounts" tabIndex={-1} className="text-xl font-bold text-foreground">
            {sectionTitle('accounts')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Administra tus cuentas bancarias y tarjetas de crédito
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {creditCards.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowOptimizer(true)}
                className="flex items-center gap-2 rounded-lg border border-border-accent bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px]"
              >
                <Sparkles size={18} />
                Próxima compra
              </button>

              <button
                type="button"
                onClick={() => setShowStatements(true)}
                className="flex items-center gap-2 rounded-lg border border-border-accent bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px]"
              >
                <Receipt size={18} />
                Extractos
              </button>
            </>
          )}

          <button
            onClick={() => {
              if (accountsLoading) return;
              accountForm.openCreateForm();
            }}
            disabled={accountsLoading}
            className="btn-primary"
          >
            <NewIcon size={18} />
            {UI_TEXT.titles.newAccount}
          </button>
        </div>
      </div>

      {/* Modales */}
      <AccountFormModal
        isOpen={accountForm.showAccountForm}
        isSubmitting={accountForm.isSubmitting}
        editingAccount={accountForm.editingAccount}
        newAccount={accountForm.newAccount}
        balanceAdjustment={accountForm.balanceAdjustment}
        initialBalanceInput={accountForm.initialBalanceInput}
        creditLimitInput={accountForm.creditLimitInput}
        monthlyLimitInput={accountForm.monthlyLimitInput}
        interestRateInput={accountForm.interestRateInput}
        savingsAccounts={savingsAccounts}
        accountTypes={ACCOUNT_TYPES}
        setNewAccount={accountForm.setNewAccount}
        setBalanceAdjustment={accountForm.setBalanceAdjustment}
        setInitialBalanceInput={accountForm.setInitialBalanceInput}
        setCreditLimitInput={accountForm.setCreditLimitInput}
        setMonthlyLimitInput={accountForm.setMonthlyLimitInput}
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
        recurringCount={
          deleteConfirm ? recurringPayments.filter(p => p.accountId === deleteConfirm.accountId).length : 0
        }
        debtCount={
          deleteConfirm ? debts.filter(d => d.accountId === deleteConfirm.accountId).length : 0
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
        isDeleting={isDeletingAccount}
      />

      <CreditCardsConsolidatedSummary
        cards={creditCardSummary.cards}
        totalLimit={creditCardSummary.totalLimit}
        totalUsed={creditCardSummary.totalUsed}
        totalAvailable={creditCardSummary.totalAvailable}
        usagePercentage={creditCardSummary.usagePercentage}
        formatCurrency={formatCurrency}
      />

      <CreditCardOptimizerModal
        isOpen={showOptimizer}
        onClose={() => setShowOptimizer(false)}
        plans={cardUsagePlans}
        formatCurrency={formatCurrency}
      />

      <CardStatementsModal
        isOpen={showStatements}
        onClose={() => setShowStatements(false)}
        schedule={paymentSchedule}
        formatCurrency={formatCurrency}
        usedCreditByCard={usedCreditByCard}
        cardsNeedingStatementConfig={cardsNeedingStatementConfig}
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
      {mainAccounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <Wallet size={28} />
          </div>
          <div>
            <p className="font-semibold text-foreground">Aún no tienes cuentas</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea tu primera cuenta para empezar a llevar el control de tu dinero.
            </p>
          </div>
        </div>
      ) : (
      <div className="space-y-4">
        {mainAccounts.map((account, mainIndex) => {
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
                balanceSettling={!balancesReady}
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
                onManagePaymentInstruments={userId
                  ? () => setPaymentInstrumentsSelection({
                      ownerId: userId,
                      accountId: account.id!,
                    })
                  : undefined}
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
                onMoveUp={() => dragDrop.moveAccount(account.id!, 'up')}
                onMoveDown={() => dragDrop.moveAccount(account.id!, 'down')}
                canMoveUp={mainIndex > 0}
                canMoveDown={mainIndex < mainAccounts.length - 1}
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
                  className={`ml-4 sm:ml-8 mt-3 space-y-3 border-l-2 border-border-accent pl-4 transition-opacity duration-200 ${dragDrop.draggedAccountId === account.id ? 'opacity-50' : ''
                    }`}
                >
                  {associatedCards.map((card, cardIndex) => (
                    <AccountCard
                      key={card.id}
                      account={card}
                      balance={getAccountBalance(card.id!)}
                      balanceSettling={!balancesReady}
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
                      onManagePaymentInstruments={userId
                        ? () => setPaymentInstrumentsSelection({
                            ownerId: userId,
                            accountId: card.id!,
                          })
                        : undefined}
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
                      onMoveUp={() => dragDrop.moveAccount(card.id!, 'up')}
                      onMoveDown={() => dragDrop.moveAccount(card.id!, 'down')}
                      canMoveUp={cardIndex > 0}
                      canMoveDown={cardIndex < associatedCards.length - 1}
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
      )}

      <PaymentInstrumentsSection
        userId={userId}
        accounts={accounts}
        accountId={paymentInstrumentsAccountId}
        isOpen={paymentInstrumentsAccountId !== null}
        onClose={() => setPaymentInstrumentsSelection(null)}
      />

    </div>
  );
};
