'use client';

import React, { useState } from 'react';
import { Plus, Repeat, List, CalendarDays, AlertTriangle } from 'lucide-react';

import type { RecurringPayment, Account, Transaction } from '../../../types/finance';
import { useRecurringDomain, useAccountDomain, useCategoryDomain, useFormatCurrency, useTransactionDomain } from '../../../hooks/useFinanceSelectors';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';
import { cycleKey } from '../../../utils/recurringDates';
import { showToast } from '../../../utils/toastHelpers';

// Componentes
import { RecurringStatsCards } from './components/RecurringStatsCards';
import { UpcomingPaymentsAlert } from './components/UpcomingPaymentsAlert';
import { RecurringPaymentCard } from './components/RecurringPaymentCard';
import { PaymentFormModal } from './components/PaymentFormModal';
import { MarkPaidModal } from './components/MarkPaidModal';
import { ConfirmDialog } from '../../modals/ConfirmDialog';
import { BaseModal } from '../../modals/BaseModal';
import { InactivePaymentsList } from './components/InactivePaymentsList';
import { RecurringCalendar } from './components/RecurringCalendar';

// Hook
import { useRecurringPaymentsView } from './hooks/useRecurringPaymentsView';

/**
 * Vista principal de pagos periódicos
 * Muestra estadísticas, alertas y lista de pagos con formulario de gestión
 */
export const RecurringPaymentsView: React.FC = () => {
  const {
    recurringPayments,
    addRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
    isPaidForMonth,
    getNextDueDate,
    getDaysUntilDue,
    getDaysOverdue,
    getPaymentHistory,
    recurringStats: stats,
  } = useRecurringDomain();
  const { accounts, defaultAccount } = useAccountDomain();
  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useTransactionDomain();
  const { categories } = useCategoryDomain();
  const formatCurrency = useFormatCurrency();
  const { hideBalances } = useUIPreferences();
  const {
    sortedPayments,
    inactivePayments,
    getPaymentDisplayData,
    showForm,
    editingPayment,
    openEditForm,
    closeForm,
    handleSubmit,
    deleteConfirm,
    confirmDelete,
    cancelDelete,
    handleDelete,
    handleReactivate,
    setShowForm,
  } = useRecurringPaymentsView({
    recurringPayments,
    accounts,
    isPaidForMonth,
    getDaysUntilDue,
    getDaysOverdue,
    getNextDueDate,
    getPaymentHistory,
    addRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
  });

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // "Ya pagó": pago seleccionado para el modal de marcar/vincular.
  const [markPaidPayment, setMarkPaidPayment] = useState<RecurringPayment | null>(null);

  // Pago del historial ("Últimos pagos") pendiente de quitar. Dos caminos: borrar
  // el gasto (revierte saldo) o solo desvincularlo (conserva el gasto). Ambos
  // dejan el ciclo sin transacción → el periódico vuelve a por cobrar/vencido.
  const [deletePaymentTx, setDeletePaymentTx] = useState<Transaction | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const runDelete = async (fn: () => Promise<void>, okMsg: string) => {
    if (!deletePaymentTx?.id || busyDelete) return;
    setBusyDelete(true);
    try {
      await fn();
      showToast.success(okMsg);
      setDeletePaymentTx(null);
    } catch {
      showToast.error('No se pudo completar');
    } finally {
      setBusyDelete(false);
    }
  };

  // Eliminar el gasto: revierte saldo/crédito (atómico).
  const handleDeletePayment = () =>
    runDelete(() => deleteTransaction(deletePaymentTx!.id!), 'Gasto eliminado');

  // Desvincular: conserva el gasto, solo limpia el vínculo al periódico. null (no
  // undefined) porque updateTransaction descarta undefined; los lectores tratan
  // recurringPaymentId nulo como "sin periódico".
  const handleUnlinkPayment = () =>
    runDelete(
      () =>
        // ponytail: cast vía unknown — el campo es string? en el tipo, pero null
        // es el valor que limpia en Firestore y que los lectores leen como vacío.
        updateTransaction(deletePaymentTx!.id!, {
          recurringPaymentId: null,
          recurringCycle: null,
        } as unknown as Partial<Transaction>),
      'Pago desmarcado'
    );

  // Ambos caminos estampan el ciclo actual → el pago aparece pagado sin depender
  // de la fecha (ver cycleKey / recurringCycle).
  const registerPaid = async (payment: RecurringPayment, accountId: string) => {
    // ponytail: usa el writer canónico (mismo que el formulario) → saldos OK.
    // Omite la detección de duplicados del formulario; añadir si genera dobles
    // registros desde la tarjeta.
    await addTransaction({
      type: 'expense',
      amount: payment.amount,
      category: payment.category,
      description: payment.name,
      date: new Date(),
      paid: true,
      accountId,
      recurringPaymentId: payment.id,
      recurringCycle: cycleKey(payment, new Date()),
    });
  };

  const linkExisting = async (payment: RecurringPayment, transactionId: string) => {
    await updateTransaction(transactionId, {
      recurringPaymentId: payment.id,
      recurringCycle: cycleKey(payment, new Date()),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header con estadísticas */}
      <div className="card">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Pagos Periódicos
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Gestiona tus suscripciones y pagos recurrentes
            </p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus size={18} />
            Nuevo Pago
          </button>
        </div>

        <RecurringStatsCards
          active={stats.active}
          paidThisMonth={stats.paidThisMonth}
          pendingThisMonth={stats.pendingThisMonth}
          totalMonthlyAmount={stats.totalMonthlyAmount}
          formatCurrency={displayAmount}
        />
      </div>

      {/* Alerta de pagos vencidos (rojo) */}
      <UpcomingPaymentsAlert
        tone="red"
        title="Pagos vencidos"
        payments={stats.overduePayments}
        getLabel={(p) => {
          const d = getDaysOverdue(p);
          return `venció hace ${d} ${d === 1 ? 'día' : 'días'}`;
        }}
        formatCurrency={displayAmount}
      />

      {/* Alerta de pagos próximos a vencer (ámbar) */}
      <UpcomingPaymentsAlert
        tone="amber"
        title="Pagos próximos a vencer"
        payments={stats.upcomingPayments}
        getLabel={(p) => `vence en ${getDaysUntilDue(p)} días`}
        formatCurrency={displayAmount}
      />

      {/* Selector de vista */}
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-white dark:bg-gray-800">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'list' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
            aria-pressed={viewMode === 'list'}
          >
            <List size={16} /> Lista
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'calendar' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
            aria-pressed={viewMode === 'calendar'}
          >
            <CalendarDays size={16} /> Calendario
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        sortedPayments.length === 0 ? (
          <div className="card"><EmptyState onCreateClick={() => setShowForm(true)} /></div>
        ) : (
          <RecurringCalendar
            payments={sortedPayments}
            formatCurrency={displayAmount}
            isPaidForMonth={isPaidForMonth}
            getDaysOverdue={getDaysOverdue}
            getDaysUntilDue={getDaysUntilDue}
          />
        )
      ) : (
        /* Lista de pagos activos */
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
            Pagos Activos
          </h3>

          {sortedPayments.length === 0 ? (
            <EmptyState onCreateClick={() => setShowForm(true)} />
          ) : (
            <div className="space-y-3">
              {sortedPayments.map((payment) => {
                const displayData = getPaymentDisplayData(payment);
                return (
                  <RecurringPaymentCard
                    key={payment.id}
                    payment={payment}
                    isPaid={displayData.isPaid}
                    daysUntilDue={displayData.daysUntilDue}
                    daysOverdue={displayData.daysOverdue}
                    nextDueDate={displayData.nextDueDate}
                    account={displayData.account}
                    history={displayData.history}
                    formatCurrency={displayAmount}
                    onEdit={() => openEditForm(payment)}
                    onDelete={() => confirmDelete(payment.id!)}
                    onMarkPaid={() => setMarkPaidPayment(payment)}
                    onDeletePayment={setDeletePaymentTx}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pagos inactivos */}
      <InactivePaymentsList
        payments={inactivePayments}
        formatCurrency={displayAmount}
        onReactivate={handleReactivate}
      />

      {/* Modales */}
      <PaymentFormModal
        isOpen={showForm}
        editingPayment={editingPayment}
        accounts={accounts}
        categories={categories.expense}
        onClose={closeForm}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="¿Eliminar pago periódico?"
        message="El pago será eliminado pero las transacciones asociadas se mantendrán."
        onConfirm={handleDelete}
        onClose={cancelDelete}
      />

      <BaseModal
        isOpen={!!deletePaymentTx}
        onClose={() => !busyDelete && setDeletePaymentTx(null)}
        title="Quitar este pago"
        titleIcon={<AlertTriangle size={20} className="text-rose-600 dark:text-rose-400" />}
        maxWidth="max-w-sm"
      >
        {deletePaymentTx && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Pago de {displayAmount(deletePaymentTx.amount)} del{' '}
              {new Date(deletePaymentTx.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}.
              El periódico volverá a por cobrar o vencido.
            </p>
            <div className="mt-5 space-y-3">
              <button
                onClick={handleDeletePayment}
                disabled={busyDelete}
                className="w-full text-left p-4 rounded-xl border-2 border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-900/10 hover:border-rose-400 transition-colors disabled:opacity-60"
              >
                <span className="block font-semibold text-gray-900 dark:text-gray-100">Eliminar gasto completo</span>
                <span className="block text-sm text-gray-500 dark:text-gray-400">Borra la transacción y revierte el saldo.</span>
              </button>
              <button
                onClick={handleUnlinkPayment}
                disabled={busyDelete}
                className="w-full text-left p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-purple-400 transition-colors disabled:opacity-60"
              >
                <span className="block font-semibold text-gray-900 dark:text-gray-100">Solo desmarcar este pago</span>
                <span className="block text-sm text-gray-500 dark:text-gray-400">Conserva el gasto; solo lo desvincula del periódico.</span>
              </button>
              <button
                onClick={() => setDeletePaymentTx(null)}
                disabled={busyDelete}
                className="w-full btn-cancel disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </BaseModal>

      <MarkPaidModal
        isOpen={!!markPaidPayment}
        payment={markPaidPayment}
        accounts={accounts}
        transactions={transactions}
        defaultAccountId={defaultAccount?.id}
        formatCurrency={displayAmount}
        onClose={() => setMarkPaidPayment(null)}
        onRegister={registerPaid}
        onLinkExisting={linkExisting}
      />
    </div>
  );
};

// Componente interno para estado vacío
const EmptyState: React.FC<{ onCreateClick: () => void }> = ({ onCreateClick }) => (
  <div className="text-center py-12 text-gray-400 dark:text-gray-500">
    <Repeat size={48} className="mx-auto mb-3 opacity-30" />
    <p>No tienes pagos periódicos configurados</p>
    <button
      onClick={onCreateClick}
      className="mt-4 text-purple-600 dark:text-purple-400 hover:underline"
    >
      Crear tu primer pago
    </button>
  </div>
);
