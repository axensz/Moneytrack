'use client';

import React, { useState } from 'react';
import { Plus, Repeat, List, CalendarDays } from 'lucide-react';

import type { RecurringPayment, Account, Transaction } from '../../../types/finance';
import { useRecurringDomain, useAccountDomain, useCategoryDomain, useFormatCurrency } from '../../../hooks/useFinanceSelectors';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';

// Componentes
import { RecurringStatsCards } from './components/RecurringStatsCards';
import { UpcomingPaymentsAlert } from './components/UpcomingPaymentsAlert';
import { RecurringPaymentCard } from './components/RecurringPaymentCard';
import { PaymentFormModal } from './components/PaymentFormModal';
import { DeletePaymentModal } from './components/DeletePaymentModal';
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
  const { accounts } = useAccountDomain();
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

      <DeletePaymentModal
        isOpen={!!deleteConfirm}
        onConfirm={handleDelete}
        onClose={cancelDelete}
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
